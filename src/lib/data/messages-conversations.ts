import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

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
