import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import {
  insertNotifications,
  selectRecentNotifications,
  selectUnreadNotificationIds,
  updateAllNotificationsRead,
  type NotificationRow,
} from '@/lib/data/notifications'

/**
 * Notifications domain: who gets told what, and how the feed is read. All table
 * access goes through src/lib/data/notifications - this module holds no queries.
 */

export type NotificationKind = 'message' | 'grade' | 'announcement'

/** A notification as the app consumes it (the stored row, kind narrowed). */
export type Notification = Omit<NotificationRow, 'kind'> & { kind: NotificationKind }

export type NotifyInput = { kind: NotificationKind; title: string; body?: string | null; link?: string | null }

/** How many unread the badge will count before it just shows "9+". */
const UNREAD_BADGE_CAP = 50

/**
 * Notify each recipient once. Deduplicates ids and drops blanks, so callers can
 * pass a raw participant list. Throws on a write failure - use notifyBestEffort
 * from a core workflow that must not fail because of a notification.
 */
export async function notify(profileIds: string[], input: NotifyInput): Promise<void> {
  const ids = [...new Set(profileIds)].filter(Boolean)
  if (ids.length === 0) return
  await insertNotifications(
    ids.map((profile_id) => ({
      profile_id,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
  )
}

/** Fire-and-forget wrapper: notify without ever throwing into the caller's flow.
 *  Notifications are a non-critical side effect - sending a message or saving a
 *  grade must still succeed if the notification write fails. */
export async function notifyBestEffort(profileIds: string[], input: NotifyInput): Promise<void> {
  try {
    await notify(profileIds, input)
  } catch {
    // deliberately swallowed - see the contract above
  }
}

export async function listMyNotifications(profileId: string, limit = 30): Promise<Notification[]> {
  return (await selectRecentNotifications(profileId, limit)) as Notification[]
}

/** Unread count for the header badge (bounded - see UNREAD_BADGE_CAP). */
export async function countUnreadNotifications(profileId: string): Promise<number> {
  return (await selectUnreadNotificationIds(profileId, UNREAD_BADGE_CAP)).length
}

/** Mark all of the caller's unread notifications read (self-scoped by RLS). */
export async function markAllNotificationsRead(actor: Profile): Promise<void> {
  await updateAllNotificationsRead(actor.id, new Date().toISOString())
}
