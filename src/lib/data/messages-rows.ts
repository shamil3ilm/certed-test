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

/** Post a message and advance its conversation's last-message summary, in one transaction
 *  (0108). The summary only ever moves forward, so sends committing out of order cannot leave
 *  the inbox showing an older message as the latest. */
export async function callPostMessage(conversationId: string, senderId: string, body: string): Promise<MessageRow> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('post_message', {
    p_conversation_id: conversationId,
    p_sender_id: senderId,
    p_body: body,
  })
  if (error) throw new Error(`data.messages.postMessage: ${error.message}`)
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
