import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Page } from '@/lib/pagination'
import { directKeyFor } from '@/lib/messaging/direct-key'

export type ConversationKind = 'direct' | 'group'

export type ConversationRow = {
  id: string
  kind: ConversationKind
  title: string | null
  created_by: string | null
  last_message_at: string | null
  last_message_body: string | null
  last_message_sender_id: string | null
  direct_key: string | null
  created_at: string
}

/**
 * ONE page of the given conversations, most recently active first, with the exact total.
 *
 * Ordering lives on `conversations.last_message_at`, not on the participation rows, so the
 * inbox has to sort and slice HERE - doing it in the app meant fetching every conversation
 * the caller is in on each page view, then throwing all but twenty away.
 *
 * `ids` is the caller's own participation set, so it is bounded by who may message them
 * rather than by how long they have been using the portal - short enough for `.in()`.
 */
export async function selectConversationPage(
  ids: string[],
  range: { from: number; to: number },
  /** Restrict to a subset of `ids` - how "unread only" is expressed, since read state lives
   *  on the caller's PARTICIPATION row rather than on the conversation. Resolved by the
   *  service and passed down so the COUNT matches the rows. */
  onlyIds?: string[],
): Promise<Page<ConversationRow>> {
  const scope = onlyIds ?? ids
  if (scope.length === 0) return { items: [], total: 0 }
  const admin = createAdminClient()
  const query = admin
    .from('conversations')
    .select('*', { count: 'exact' })
    .in('id', scope)
    // nullsFirst: false keeps a conversation with no messages yet at the BOTTOM rather than
    // pinned above every active thread.
    .order('last_message_at', { ascending: false, nullsFirst: false })
    // last_message_at ties (a group created in the same second) would otherwise order
    // arbitrarily, and an unstable order under paging can repeat or skip a row.
    .order('id', { ascending: true })
  const { data, error, count } = await query.range(range.from, range.to)
  if (error) throw new Error(`data.messages.selectConversationPage: ${error.message}`)
  return { items: (data ?? []) as ConversationRow[], total: count ?? 0 }
}

/**
 * The three fields that decide whether a conversation is unread FOR one reader, over a
 * bounded id set.
 *
 * Unread is not a column: it is the conversation's last_message_at compared against the
 * caller's own last_read_at, ignoring messages they sent themselves. So an "unread only"
 * filter cannot be a `.eq()` - the id set has to be resolved first and then paged, which is
 * what keeps the pager's count describing the rows it actually shows.
 *
 * Three narrow columns over the caller's own conversations, and only when the filter is on.
 */
export async function selectConversationReadState(
  ids: string[],
): Promise<{ id: string; last_message_at: string | null; last_message_sender_id: string | null }[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('conversations')
    .select('id, last_message_at, last_message_sender_id')
    .in('id', ids)
    .order('id', { ascending: true })
  if (error) throw new Error(`data.messages.selectConversationReadState: ${error.message}`)
  return (data ?? []) as { id: string; last_message_at: string | null; last_message_sender_id: string | null }[]
}

export async function selectConversationById(id: string): Promise<ConversationRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('conversations').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`data.messages.selectConversationById: ${error.message}`)
  return (data as ConversationRow) ?? null
}

export async function selectConversationKind(id: string): Promise<ConversationKind | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('conversations').select('kind').eq('id', id).maybeSingle()
  if (error) throw new Error(`data.messages.selectConversationKind: ${error.message}`)
  return (data as { kind?: ConversationKind } | null)?.kind ?? null
}

export async function updateConversationTitle(conversationId: string, title: string | null): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('conversations').update({ title }).eq('id', conversationId)
  if (error) throw new Error(`data.messages.updateConversationTitle: ${error.message}`)
}

/**
 * Create a conversation WITH its participants, in one transaction (0108). A thread with nobody
 * in it cannot be left behind.
 *
 * A direct conversation is keyed by its pair: when one already exists - including one a
 * concurrent request created a moment ago - that thread is returned (`created: false`), with
 * any participant it is missing added back.
 */
export async function callCreateConversation(input: {
  kind: ConversationKind
  title: string | null
  createdBy: string
  directKey: string | null
  participantIds: string[]
}): Promise<{ id: string; created: boolean }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('create_conversation', {
    p_kind: input.kind,
    p_title: input.title,
    p_created_by: input.createdBy,
    p_direct_key: input.directKey,
    p_participant_ids: input.participantIds,
  })
  if (error) throw new Error(`data.messages.createConversation: ${error.message}`)
  return data as { id: string; created: boolean }
}

/**
 * The existing direct conversation between two people, or null.
 *
 * ONE indexed lookup on `conversations.direct_key` - the canonical sorted pair the app
 * already writes (directKeyFor), backed by the unique index 0023 added. This replaced three
 * round trips that scanned every conversation_participants row for one person, intersected
 * them with the other's, then filtered the survivors by kind: unbounded on the first read,
 * and answering from `[0]` a set the database could have identified outright.
 */
export async function findDirectConversationId(a: string, b: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('conversations')
    .select('id')
    .eq('kind', 'direct')
    .eq('direct_key', directKeyFor(a, b))
    .maybeSingle()
  if (error) throw new Error(`data.messages.findDirectConversationId: ${error.message}`)
  return (data as { id: string } | null)?.id ?? null
}
