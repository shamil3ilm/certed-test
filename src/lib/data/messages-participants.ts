import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/data/paginate'

type ParticipationRow = { conversation_id: string; last_read_at: string | null }

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

export async function selectParticipantIds(conversationId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('conversation_participants')
    .select('profile_id')
    .eq('conversation_id', conversationId)
  if (error) throw new Error(`data.messages.selectParticipantIds: ${error.message}`)
  return ((data ?? []) as { profile_id: string }[]).map((row) => row.profile_id)
}

/**
 * Every conversation this person is in, with their read watermark.
 *
 * COMPLETE, and it has to be: listInbox resolves this id set FIRST and then pages it in
 * SQL, so a capped read here does not shorten a page - it removes conversations from the
 * inbox entirely AND from its total, and the unread filter silently stops considering
 * them. The reader sees a shorter inbox with a confident count, which is indistinguishable
 * from having fewer conversations.
 *
 * `(conversation_id, profile_id)` is UNIQUE, so within one person's rows `conversation_id`
 * is by itself a total order - exactly what the offset walk needs to avoid repeating one
 * row and skipping another at a page boundary.
 */
export async function selectMyParticipations(profileId: string): Promise<ParticipationRow[]> {
  const admin = createAdminClient()
  return fetchAllPaged<ParticipationRow>(
    (from, to) =>
      admin
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('profile_id', profileId)
        .order('conversation_id', { ascending: true })
        .range(from, to),
    'data.messages.selectMyParticipations',
  )
}

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

export async function insertParticipants(conversationId: string, profileIds: string[]): Promise<void> {
  if (profileIds.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin
    .from('conversation_participants')
    .insert(profileIds.map((profile_id) => ({ conversation_id: conversationId, profile_id })))
  if (error) throw new Error(`data.messages.insertParticipants: ${error.message}`)
}

export async function deleteParticipants(conversationId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('conversation_participants').delete().eq('conversation_id', conversationId)
  if (error) throw new Error(`data.messages.deleteParticipants: ${error.message}`)
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
