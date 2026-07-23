import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { PermissionError, ValidationError, RateLimitError } from '@/lib/errors'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { canMessage } from '@/lib/messaging/recipient-policy'
import { notifyBestEffort } from '@/lib/services/notifications'
import { rateLimit } from '@/lib/security/rate-limit'
import {
  deleteParticipant,
  findDirectConversationId,
  insertConversation,
  insertMessage,
  insertParticipants,
  selectParticipantIds,
  updateConversationLastMessage,
  updateParticipantLastRead,
  type ConversationKind,
  type MessageRow,
} from '@/lib/data/messages'
import { assertParticipant, assertStillMessageable, directKeyFor } from './policies'

/** Mutating messaging workflows. Reads live in ./queries, access rules in ./policies. */

export type CreateConversationInput = { recipientIds: string[]; title?: string | null }

/** Cap on recipients in a single new conversation (excludes the actor). Keeps a
 *  crafted request from seeding an unbounded participant fan-out. */
const MAX_RECIPIENTS = 25

/**
 * Create a conversation after checking EVERY recipient is messageable by the actor.
 * A 1:1 thread is deduped to the existing one, and if a concurrent create wins the
 * unique-key race (0028) we join the winner's thread instead of erroring.
 */
export async function createConversation(actor: Profile, input: CreateConversationInput): Promise<{ id: string }> {
  const recipientIds = [...new Set(input.recipientIds)].filter((id) => id && id !== actor.id)
  if (recipientIds.length === 0) throw new ValidationError('Pick at least one recipient.')
  if (recipientIds.length > MAX_RECIPIENTS) {
    throw new ValidationError(`A conversation can include at most ${MAX_RECIPIENTS} other people.`)
  }

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
    const existing = await findDirectConversationId(actor.id, recipientIds[0])
    if (existing) return { id: existing }
  }

  const { conversation, error } = await insertConversation({
    kind,
    title: kind === 'group' ? (input.title ?? null) : null,
    created_by: actor.id,
    last_message_at: new Date().toISOString(),
    direct_key: kind === 'direct' ? directKeyFor(actor.id, recipientIds[0]) : null,
  })
  if (error || !conversation) {
    // We may simply have lost a concurrent create race for this pair - the unique
    // index rejected our duplicate, so join the thread the winner created.
    if (kind === 'direct') {
      const winner = await findDirectConversationId(actor.id, recipientIds[0])
      if (winner) return { id: winner }
    }
    throw new Error(`messaging.createConversation: ${error?.message ?? 'insert failed'}`)
  }

  await insertParticipants(conversation.id, [actor.id, ...recipientIds])
  await auditPrivilegedAction(actor, 'conversation.create', 'conversation', conversation.id)
  return { id: conversation.id }
}

/** Post a message. Caller must be a participant AND (for a direct thread) still be
 *  allowed to message the counterparty. Bumps the conversation's cached last message. */
export async function sendMessage(actor: Profile, conversationId: string, body: string): Promise<MessageRow> {
  const text = body.trim()
  if (!text) throw new ValidationError('Message cannot be empty.')
  if (text.length > 5000) throw new ValidationError('Message is too long.')
  // Throttle before touching the DB so a burst is shed cheaply.
  if (!rateLimit(`msg-send:${actor.id}`, { limit: 30, windowMs: 60_000 }).ok) {
    throw new RateLimitError('You are sending messages too quickly. Please wait a moment.')
  }
  await assertParticipant(actor, conversationId)

  // Read the participants once - shared by the re-authorisation check and the
  // notification fan-out, so the check costs no extra round trip of its own.
  const others = (await selectParticipantIds(conversationId)).filter((id) => id !== actor.id)
  await assertStillMessageable(actor, conversationId, others)

  const now = new Date().toISOString()
  const message = await insertMessage(conversationId, actor.id, text)
  await updateConversationLastMessage(conversationId, {
    last_message_at: now,
    last_message_body: text,
    last_message_sender_id: actor.id,
  })

  await notifyBestEffort(others, {
    kind: 'message',
    title: `New message from ${actor.full_name ?? actor.email}`,
    body: text.slice(0, 140),
    link: `/messages/${conversationId}`,
  })

  return message
}

/** Move the caller's read watermark to now. Asserts participation first, so a
 *  stray/forged conversation id fails loudly rather than updating zero rows. */
export async function markRead(actor: Profile, conversationId: string): Promise<void> {
  await assertParticipant(actor, conversationId)
  await updateParticipantLastRead(conversationId, actor.id, new Date().toISOString())
}

/** The caller leaves a conversation - removes their own participant row, so it drops
 *  out of their inbox and they can no longer read or post. Others keep the thread. */
export async function leaveConversation(actor: Profile, conversationId: string): Promise<void> {
  await assertParticipant(actor, conversationId)
  await deleteParticipant(conversationId, actor.id)
}
