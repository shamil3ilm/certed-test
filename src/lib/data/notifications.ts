import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Data layer for `notifications` - raw table access only.
 *
 * Per docs/architecture-rules.md section 2.4 this module owns queries, row shape
 * and bounded/index-aware lookups. It must NOT decide who gets notified, fan out
 * side effects, redirect, or shape UI - that is the domain layer's job
 * (src/lib/services/notifications.ts).
 *
 * Client choice is deliberate: writes use the service-role client because RLS on
 * notifications permits only self-read and self-mark-read (0027/0029); reads use
 * the request's RLS client so a caller can only ever see their own rows.
 */

export type NotificationRow = {
  id: string
  profile_id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export type NewNotificationRow = {
  profile_id: string
  kind: string
  title: string
  body: string | null
  link: string | null
}

/** Insert notification rows. No-ops on an empty batch. */
export async function insertNotifications(rows: NewNotificationRow[]): Promise<void> {
  if (rows.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin.from('notifications').insert(rows)
  if (error) throw new Error(`data.notifications.insert: ${error.message}`)
}

/** A profile's most recent notifications, newest first. */
export async function selectRecentNotifications(profileId: string, limit: number): Promise<NotificationRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`data.notifications.selectRecent: ${error.message}`)
  return (data ?? []) as NotificationRow[]
}

/** Ids of a profile's unread notifications, capped - the header badge only needs a
 *  small number, so this stays a bounded read rather than a full scan. */
export async function selectUnreadNotificationIds(profileId: string, cap: number): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('profile_id', profileId)
    .is('read_at', null)
    .limit(cap)
  if (error) throw new Error(`data.notifications.selectUnreadIds: ${error.message}`)
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/** Stamp read_at on every unread notification belonging to a profile. */
export async function updateAllNotificationsRead(profileId: string, readAt: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: readAt })
    .eq('profile_id', profileId)
    .is('read_at', null)
  if (error) throw new Error(`data.notifications.updateAllRead: ${error.message}`)
}
