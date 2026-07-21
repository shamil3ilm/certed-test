import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { PermissionError, NotFoundError, ValidationError, RateLimitError } from '@/lib/errors'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { getProfileNamesByIds } from '@/lib/services/users'
import { canMessage } from '@/lib/messaging/recipient-policy'
import { rateLimit } from '@/lib/security/rate-limit'

export type ConversationKind = 'direct' | 'group'

export type Conversation = {
  id: string
  kind: ConversationKind
  title: string | null
  created_by: string | null
  last_message_at: string | null
  created_at: string
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string | null
  body: string
  created_at: string
}

export type InboxItem = {
  id: string
  kind: ConversationKind
  title: string
  lastMessage: string | null
  lastAt: string | null
  hasUnread: boolean
}

export type ThreadData = {
  conversation: Conversation
  title: string
  messages: Message[]
  participants: { id: string; name: string }[]
  hasEarlier: boolean // older messages exist before the first one shown
  earlierCursor: string | null // created_at of the oldest shown message (the "load earlier" cursor)
  isLatestWindow: boolean // true when showing the most recent window (no `before`)
}

/** Messages loaded per thread window; older ones load on demand via a cursor. */
const MESSAGE_PAGE = 50

/** Verify the caller participates in a conversation (defense-in-depth alongside
 *  RLS; also covers mock mode which has no RLS). Throws if not. */
async function assertParticipant(actor: Profile, conversationId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('profile_id', actor.id)
    .maybeSingle()
  if (error) throw new Error(`messaging.assertParticipant: ${error.message}`)
  if (!data) throw new PermissionError('You are not a participant in this conversation.')
}

/** Find an existing 1:1 conversation between two profiles, if any (dedupe). */
async function findDirectConversation(a: string, b: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: aParts } = await admin.from('conversation_participants').select('conversation_id').eq('profile_id', a)
  const aIds = ((aParts ?? []) as { conversation_id: string }[]).map((r) => r.conversation_id)
  if (aIds.length === 0) return null
  const { data: bParts } = await admin
    .from('conversation_participants')
    .select('conversation_id')
    .eq('profile_id', b)
    .in('conversation_id', aIds)
  const shared = ((bParts ?? []) as { conversation_id: string }[]).map((r) => r.conversation_id)
  if (shared.length === 0) return null
  const { data: convs } = await admin.from('conversations').select('id').in('id', shared).eq('kind', 'direct')
  return ((convs ?? []) as { id: string }[])[0]?.id ?? null
}

export type CreateConversationInput = { recipientIds: string[]; title?: string | null }

/**
 * Creates a conversation after checking EVERY recipient is messageable by the
 * actor (recipientPolicy). A 1:1 conversation is deduped to the existing one.
 * Participants are seeded via the service role.
 */
export async function createConversation(actor: Profile, input: CreateConversationInput): Promise<{ id: string }> {
  const recipientIds = [...new Set(input.recipientIds)].filter((id) => id && id !== actor.id)
  if (recipientIds.length === 0) throw new ValidationError('Pick at least one recipient.')

  if (!rateLimit(`msg-conv:${actor.id}`, { limit: 15, windowMs: 60_000 }).ok) {
    throw new RateLimitError('You are starting conversations too quickly. Please wait a moment.')
  }

  for (const recipientId of recipientIds) {
    if (!(await canMessage(actor, recipientId))) {
      throw new PermissionError('You are not allowed to message one of those recipients.')
    }
  }

  const kind: ConversationKind = recipientIds.length === 1 ? 'direct' : 'group'

  if (kind === 'direct') {
    const existing = await findDirectConversation(actor.id, recipientIds[0])
    if (existing) return { id: existing }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: conv, error } = await admin
    .from('conversations')
    .insert({ kind, title: kind === 'group' ? input.title ?? null : null, created_by: actor.id, last_message_at: now })
    .select('*')
    .single()
  if (error) throw new Error(`messaging.createConversation: ${error.message}`)
  const conversation = conv as Conversation

  const participants = [actor.id, ...recipientIds].map((profile_id) => ({ conversation_id: conversation.id, profile_id }))
  const { error: pErr } = await admin.from('conversation_participants').insert(participants)
  if (pErr) throw new Error(`messaging.createConversation participants: ${pErr.message}`)

  await auditPrivilegedAction(actor, 'conversation.create', 'conversation', conversation.id)
  return { id: conversation.id }
}

/** Posts a message; caller must be a participant. Bumps last_message_at. */
export async function sendMessage(actor: Profile, conversationId: string, body: string): Promise<Message> {
  const text = body.trim()
  if (!text) throw new ValidationError('Message cannot be empty.')
  if (text.length > 5000) throw new ValidationError('Message is too long.')
  // Throttle before touching the DB so a burst is shed cheaply.
  if (!rateLimit(`msg-send:${actor.id}`, { limit: 30, windowMs: 60_000 }).ok) {
    throw new RateLimitError('You are sending messages too quickly. Please wait a moment.')
  }
  await assertParticipant(actor, conversationId)

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: actor.id, body: text })
    .select('*')
    .single()
  if (error) throw new Error(`messaging.sendMessage: ${error.message}`)
  await admin.from('conversations').update({ last_message_at: now }).eq('id', conversationId)
  return data as Message
}

/** Marks the caller's read watermark to now for a conversation they're in.
 *  Asserts participation first, so a stray/forged conversation id fails loudly
 *  rather than silently updating zero rows. */
export async function markRead(actor: Profile, conversationId: string): Promise<void> {
  await assertParticipant(actor, conversationId)
  const admin = createAdminClient()
  const { error } = await admin
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', actor.id)
  if (error) throw new Error(`messaging.markRead: ${error.message}`)
}

/** The caller's inbox: their conversations, newest activity first, each with a
 *  title (the other person or group name), a last-message preview, and an unread
 *  flag. Bounded - reads only the last message per conversation, never the full
 *  history. Unread is last-message-based: true when the most recent message is
 *  from someone else and newer than the caller's read watermark. */
export async function listInbox(actor: Profile): Promise<InboxItem[]> {
  const admin = createAdminClient()
  const { data: myParts } = await admin
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('profile_id', actor.id)
  const parts = (myParts ?? []) as { conversation_id: string; last_read_at: string | null }[]
  if (parts.length === 0) return []
  const convIds = parts.map((p) => p.conversation_id)
  const lastReadByConv = new Map(parts.map((p) => [p.conversation_id, p.last_read_at]))

  const [{ data: convs }, { data: allParts }] = await Promise.all([
    admin.from('conversations').select('*').in('id', convIds),
    admin.from('conversation_participants').select('conversation_id, profile_id').in('conversation_id', convIds),
  ])
  const conversations = (convs ?? []) as Conversation[]

  const otherIds = ((allParts ?? []) as { conversation_id: string; profile_id: string }[])
    .filter((p) => p.profile_id !== actor.id)
    .map((p) => p.profile_id)
  const names = await getProfileNamesByIds([...new Set(otherIds)])

  const othersByConv = new Map<string, string[]>()
  for (const p of (allParts ?? []) as { conversation_id: string; profile_id: string }[]) {
    if (p.profile_id === actor.id) continue
    const list = othersByConv.get(p.conversation_id) ?? []
    list.push(names.get(p.profile_id) ?? 'Unknown')
    othersByConv.set(p.conversation_id, list)
  }

  // Last message per conversation only - a bounded, per-conversation read instead
  // of scanning every message the caller can see.
  type LastMsg = { sender_id: string | null; body: string; created_at: string }
  const lastByConv = new Map<string, LastMsg>()
  await Promise.all(
    conversations.map(async (c) => {
      const { data } = await admin
        .from('messages')
        .select('sender_id, body, created_at')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) lastByConv.set(c.id, data as LastMsg)
    }),
  )

  return conversations
    .map((c) => {
      const last = lastByConv.get(c.id)
      const readAt = lastReadByConv.get(c.id) ?? null
      const hasUnread =
        last != null && last.sender_id !== actor.id && (readAt == null || last.created_at > readAt)
      return {
        id: c.id,
        kind: c.kind,
        // A null title (every minimal group) is auto-titled from the other
        // participants; an explicit group title, if ever set, wins.
        title: c.title ?? ((othersByConv.get(c.id) ?? []).join(', ') || (c.kind === 'group' ? 'Group' : 'Unknown')),
        lastMessage: last?.body ?? null,
        lastAt: c.last_message_at,
        hasUnread,
      }
    })
    .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
}

/** A thread window for a conversation the caller is in (else NotFound/Permission).
 *  Shows the most recent MESSAGE_PAGE messages by default; pass `before` (a message
 *  created_at) to load the window of older messages just before it. */
export async function loadThread(
  actor: Profile,
  conversationId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<ThreadData> {
  await assertParticipant(actor, conversationId)
  const admin = createAdminClient()
  const { data: conv } = await admin.from('conversations').select('*').eq('id', conversationId).maybeSingle()
  if (!conv) throw new NotFoundError('Conversation not found.')
  const conversation = conv as Conversation

  const limit = opts.limit ?? MESSAGE_PAGE
  let msgQuery = admin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false }) // newest first, so limit keeps the recent window
    .limit(limit + 1) // +1 sentinel reveals whether older messages remain
  if (opts.before) msgQuery = msgQuery.lt('created_at', opts.before)

  const [{ data: msgs }, { data: parts }] = await Promise.all([
    msgQuery,
    admin.from('conversation_participants').select('profile_id').eq('conversation_id', conversationId),
  ])
  const desc = (msgs ?? []) as Message[]
  const hasEarlier = desc.length > limit
  const shown = desc.slice(0, limit).reverse() // drop the sentinel; ascending for display

  const participantIds = ((parts ?? []) as { profile_id: string }[]).map((p) => p.profile_id)
  const names = await getProfileNamesByIds(participantIds)
  const participants = participantIds.map((id) => ({ id, name: names.get(id) ?? 'Unknown' }))
  const others = participants.filter((p) => p.id !== actor.id)
  const autoTitle = others.map((o) => o.name).join(', ')

  return {
    conversation,
    // Same rule as the inbox: explicit title wins, else the other participants.
    title: conversation.title ?? (autoTitle || (conversation.kind === 'group' ? 'Group' : 'Unknown')),
    messages: shown,
    participants,
    hasEarlier,
    earlierCursor: shown[0]?.created_at ?? null,
    isLatestWindow: !opts.before,
  }
}
