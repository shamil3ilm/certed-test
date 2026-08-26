import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeIlike } from '@/lib/text/ilike'

export type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string | null
  body: string
  created_at: string
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

export async function searchMessages(conversationId: string, query: string, limit: number): Promise<MessageRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .ilike('body', `%${escapeIlike(query)}%`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`data.messages.search: ${error.message}`)
  return (data ?? []) as MessageRow[]
}
