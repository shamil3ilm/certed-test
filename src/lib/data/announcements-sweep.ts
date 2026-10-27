import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The go-live sweep's claim, SERVICE-ROLE: the cron carries no session. Same shape as
 * assignments-due-sweep.ts - claim first, then work from what was claimed.
 */

/** How many announcements one pass takes. See claimAnnouncementsGoingLive. */
const CLAIM_BATCH = 100

export type GoingLiveAnnouncement = {
  id: string
  class_id: string
  title: string
  message: string
  author_id: string | null
  publish_at: string
  expires_at: string | null
}

/**
 * Claim the active class announcements whose publish time has arrived and whose class has not yet
 * been told, stamping each.
 *
 * Two steps, and the stamp is the exclusivity: selecting and notifying without it would let two
 * overlapping passes announce one post twice. Capped per pass; whatever is left is taken by the
 * next run 15 minutes later, and nothing renders this count.
 */
export async function claimAnnouncementsGoingLive(nowIso: string): Promise<GoingLiveAnnouncement[]> {
  const admin = createAdminClient()
  const { data: due, error } = await admin
    .from('announcements')
    .select('id')
    .lte('publish_at', nowIso)
    .is('live_notified_at', null)
    .eq('status', 'active')
    .not('class_id', 'is', null)
    .order('publish_at', { ascending: true })
    .limit(CLAIM_BATCH)
  if (error) throw new Error(`announcements.selectGoingLive: ${error.message}`)

  const ids = (due ?? []).map((row) => (row as { id: string }).id)
  if (ids.length === 0) return []

  const { data: claimed, error: claimError } = await admin
    .from('announcements')
    .update({ live_notified_at: nowIso })
    .in('id', ids)
    .is('live_notified_at', null)
    .select('id, class_id, title, message, author_id, publish_at, expires_at')
  if (claimError) throw new Error(`announcements.claimGoingLive: ${claimError.message}`)
  return (claimed ?? []) as GoingLiveAnnouncement[]
}
