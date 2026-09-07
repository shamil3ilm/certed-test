import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Page } from '@/lib/pagination'

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

type NewConversation = {
  kind: ConversationKind
  title: string | null
  created_by: string
  last_message_at: string
  direct_key: string | null
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
): Promise<Page<ConversationRow>> {
  if (ids.length === 0) return { items: [], total: 0 }
  const admin = createAdminClient()
  const { data, error, count } = await admin
    .from('conversations')
    .select('*', { count: 'exact' })
    .in('id', ids)
    // nullsFirst: false keeps a conversation with no messages yet at the BOTTOM rather than
    // pinned above every active thread.
    .order('last_message_at', { ascending: false, nullsFirst: false })
    // last_message_at ties (a group created in the same second) would otherwise order
    // arbitrarily, and an unstable order under paging can repeat or skip a row.
    .order('id', { ascending: true })
    .range(range.from, range.to)
  if (error) throw new Error(`data.messages.selectConversationPage: ${error.message}`)
  return { items: (data ?? []) as ConversationRow[], total: count ?? 0 }
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

export async function insertConversation(
  row: NewConversation,
): Promise<{ conversation: ConversationRow | null; error: { message: string } | null }> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('conversations').insert(row).select('*').single()
  return { conversation: (data as ConversationRow) ?? null, error: error ?? null }
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('conversations').delete().eq('id', conversationId)
  if (error) throw new Error(`data.messages.deleteConversation: ${error.message}`)
}

export async function updateConversationLastMessage(
  conversationId: string,
  patch: { last_message_at: string; last_message_body: string; last_message_sender_id: string },
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('conversations').update(patch).eq('id', conversationId)
  if (error) throw new Error(`data.messages.updateConversationLastMessage: ${error.message}`)
}

export async function findDirectConversationId(a: string, b: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: aParts, error: aError } = await admin
    .from('conversation_participants')
    .select('conversation_id')
    .eq('profile_id', a)
  if (aError) throw new Error(`data.messages.findDirectConversationId.a: ${aError.message}`)
  const aIds = ((aParts ?? []) as { conversation_id: string }[]).map((row) => row.conversation_id)
  if (aIds.length === 0) return null

  const { data: bParts, error: bError } = await admin
    .from('conversation_participants')
    .select('conversation_id')
    .eq('profile_id', b)
    .in('conversation_id', aIds)
  if (bError) throw new Error(`data.messages.findDirectConversationId.b: ${bError.message}`)
  const shared = ((bParts ?? []) as { conversation_id: string }[]).map((row) => row.conversation_id)
  if (shared.length === 0) return null

  const { data: conversations, error: convError } = await admin
    .from('conversations')
    .select('id')
    .in('id', shared)
    .eq('kind', 'direct')
  if (convError) throw new Error(`data.messages.findDirectConversationId.conversations: ${convError.message}`)
  return ((conversations ?? []) as { id: string }[])[0]?.id ?? null
}
