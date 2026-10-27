import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Table access for `notification_mutes` (0125).
 *
 * A person reads and writes only their OWN rows, through the request client (RLS `is_self_active`).
 * The notification writer has no session of its own to speak for the recipients, so it asks the
 * service role which of them have muted a kind.
 */

/** The keys the signed-in person has muted. */
export async function selectMyMutedKeys(): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('notification_mutes').select('key')
  if (error) throw new Error(`notificationMutes.selectMine: ${error.message}`)
  return ((data ?? []) as { key: string }[]).map((row) => row.key)
}

/**
 * Make the person's muted set exactly `keys`. Two statements, not one transaction: a failure
 * between them leaves nothing muted, which means more notices rather than fewer - the safe way
 * to be wrong.
 */
export async function replaceMyMutes(profileId: string, keys: string[]): Promise<void> {
  const supabase = await createClient()
  const cleared = await supabase.from('notification_mutes').delete().eq('profile_id', profileId)
  if (cleared.error) throw new Error(`notificationMutes.clear: ${cleared.error.message}`)
  if (keys.length === 0) return
  const { error } = await supabase
    .from('notification_mutes')
    .insert(keys.map((key) => ({ profile_id: profileId, key })))
  if (error) throw new Error(`notificationMutes.insert: ${error.message}`)
}

/**
 * Which of these people have muted this key. SERVICE ROLE, and only for the notification writer:
 * it is asked about the people it is about to notify and nothing else.
 */
export async function selectMutedProfileIds(key: string, profileIds: string[]): Promise<Set<string>> {
  if (profileIds.length === 0) return new Set()
  const { data, error } = await createAdminClient()
    .from('notification_mutes')
    .select('profile_id')
    .eq('key', key)
    .in('profile_id', profileIds)
  if (error) throw new Error(`notificationMutes.selectMuted: ${error.message}`)
  return new Set(((data ?? []) as { profile_id: string }[]).map((row) => row.profile_id))
}
