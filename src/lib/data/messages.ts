import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Data layer for messaging: `conversations`, `conversation_participants`,
 * `messages`. Raw table access only - no permission checks, notifications, audit
 * or UI shaping (docs/architecture-rules.md sec 2.4).
 *
 * These all use the service-role client: messaging RLS is participant-scoped, and
 * the domain layer performs its own participation check (assertParticipant) plus
 * the messageability policy before any of these are called.
 */

export type ConversationKind = 'direct' | 'group'

export type ConversationRow = {
  id: string
  kind: ConversationKind
  title: string | null
  created_by: string | null
  last_message_at: string | null
  last_message_body: string | null
  last_message_sender_id: string | null
  /** Canonical sorted pair key for a direct thread (0028); null for groups. */
  direct_key: string | null
  created_at: string
}

export type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string | null
  body: string
  created_at: string
}

export type ParticipationRow = { conversation_id: string; last_read_at: string | null }

/** Is this profile a participant? Returns the row id, or null. */
export async function findParticipantId(conversationId: string, profileId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw new Error(`data.messages.findParticipantId: ${error.message}`)
  return (data as { id: string } | null)?.id ?? null
}

/** Every participant's profile id for one conversation. */
export async function selectParticipantIds(conversationId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('conversation_participants')
    .select('profile_id')
    .eq('conversation_id', conversationId)
  if (error) throw new Error(`data.messages.selectParticipantIds: ${error.message}`)
  return ((data ?? []) as { profile_id: string }[]).map((r) => r.profile_id)
}

/** The conversations a profile belongs to, with their read watermark. */
export async function selectMyParticipations(profileId: string): Promise<ParticipationRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('profile_id', profileId)
  if (error) throw new Error(`data.messages.selectMyParticipations: ${error.message}`)
  return (data ?? []) as ParticipationRow[]
}

/** Participant rows across a set of conversations (for titles/name resolution). */
export async function selectParticipantsForConversations(
  conversationIds: string[],
): Promise<{ conversation_id: string; profile_id: string }[]> {
  if (conversationIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('conversation_participants')
    .select('conversation_id, profile_id')
    .in('conversation_id', conversationIds)
  if (error) throw new Error(`data.messages.selectParticipantsForConversations: ${error.message}`)
  return (data ?? []) as { conversation_id: string; profile_id: string }[]
}

export async function selectConversationsByIds(ids: string[]): Promise<ConversationRow[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin.from('conversations').select('*').in('id', ids)
  if (error) throw new Error(`data.messages.selectConversationsByIds: ${error.message}`)
  return (data ?? []) as ConversationRow[]
}

export async function selectConversationById(id: string): Promise<ConversationRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('conversations').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`data.messages.selectConversationById: ${error.message}`)
  return (data as ConversationRow) ?? null
}

/** Just the kind - used on the send hot path, where the full row isn't needed. */
export async function selectConversationKind(id: string): Promise<ConversationKind | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('conversations').select('kind').eq('id', id).maybeSingle()
  if (error) throw new Error(`data.messages.selectConversationKind: ${error.message}`)
  return (data as { kind?: ConversationKind } | null)?.kind ?? null
}

export type NewConversation = {
  kind: ConversationKind
  title: string | null
  created_by: string
  last_message_at: string
  direct_key: string | null
}

/**
 * Insert a conversation. Returns the error instead of throwing so the caller can
 * distinguish a lost direct-thread race (0028's unique index) from a real failure -
 * interpreting that is a domain decision, not a data-layer one.
 */
export async function insertConversation(
  row: NewConversation,
): Promise<{ conversation: ConversationRow | null; error: { message: string } | null }> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('conversations').insert(row).select('*').single()
  return { conversation: (data as ConversationRow) ?? null, error: error ?? null }
}

export async function insertParticipants(conversationId: string, profileIds: string[]): Promise<void> {
  if (profileIds.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin
    .from('conversation_participants')
    .insert(profileIds.map((profile_id) => ({ conversation_id: conversationId, profile_id })))
  if (error) throw new Error(`data.messages.insertParticipants: ${error.message}`)
}

export async function deleteParticipant(conversationId: string, profileId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('profile_id', profileId)
  if (error) throw new Error(`data.messages.deleteParticipant: ${error.message}`)
}

export async function updateParticipantLastRead(
  conversationId: string,
  profileId: string,
  readAt: string,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('conversation_participants')
    .update({ last_read_at: readAt })
    .eq('conversation_id', conversationId)
    .eq('profile_id', profileId)
  if (error) throw new Error(`data.messages.updateParticipantLastRead: ${error.message}`)
}

export async function insertMessage(conversationId: string, senderId: string, body: string): Promise<MessageRow> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
    .select('*')
    .single()
  if (error) throw new Error(`data.messages.insertMessage: ${error.message}`)
  return data as MessageRow
}

/** Cache the latest message on the conversation row (0025) so the inbox needs no
 *  per-thread read. */
export async function updateConversationLastMessage(
  conversationId: string,
  patch: { last_message_at: string; last_message_body: string; last_message_sender_id: string },
): Promise<void> {
  const admin = createAdminClient()
  await admin.from('conversations').update(patch).eq('id', conversationId)
}

/** A window of messages, newest first. Requests `limit + 1` so the caller can tell
 *  whether older messages remain without a second count query. */
export async function selectMessageWindow(
  conversationId: string,
  opts: { before?: string; limit: number },
): Promise<MessageRow[]> {
  const admin = createAdminClient()
  let query = admin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(opts.limit + 1)
  if (opts.before) query = query.lt('created_at', opts.before)
  const { data, error } = await query
  if (error) throw new Error(`data.messages.selectMessageWindow: ${error.message}`)
  return (data ?? []) as MessageRow[]
}

/** The existing 1:1 conversation between two profiles, if any. */
export async function findDirectConversationId(a: string, b: string): Promise<string | null> {
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
