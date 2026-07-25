import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { PermissionError } from '@/lib/errors'
import { canMessage } from '@/lib/messaging/recipient-policy'
import { findParticipantId, selectConversationKind } from '@/lib/data/messages'

/** Access rules for a conversation. Kept apart from the command handlers so the
 *  "who may do this" decisions are readable in one place. */

/** Verify the caller participates in a conversation (defense-in-depth alongside
 *  RLS; also covers mock mode, which has no RLS). Throws if not. */
export async function assertParticipant(actor: Profile, conversationId: string): Promise<void> {
  const participantId = await findParticipantId(conversationId, actor.id)
  if (!participantId) throw new PermissionError('You are not a participant in this conversation.')
}

/**
 * A DIRECT thread must not outlive the relationship that authorised it: once the
 * student unenrolled, the mentorship ended or the account was revoked, the pair is
 * no longer messageable and the thread goes read-only rather than becoming a back
 * door. Groups stay participation-gated - their membership is curated and there is
 * no single counterparty to re-authorise against.
 */
export async function assertStillMessageable(
  actor: Profile,
  conversationId: string,
  otherParticipantIds: string[],
): Promise<void> {
  const kind = await selectConversationKind(conversationId)
  if (kind !== 'direct' || otherParticipantIds.length !== 1) return
  if (!(await canMessage(actor, otherParticipantIds[0]))) {
    throw new PermissionError('You can no longer message this person.')
  }
}

/** Canonical key for a 1:1 pair - sorted, so the pair maps to exactly one value no
 *  matter who started the thread. Must match the 0028 backfill's ordering
 *  (string_agg(profile_id::text ORDER BY profile_id::text)). */
export function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':')
}
