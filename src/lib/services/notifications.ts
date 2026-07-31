import 'server-only'
import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { getClassMembers } from '@/lib/services/classes'
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

type NotificationKind = 'message' | 'grade' | 'announcement' | 'assignment' | 'submission'

/** A notification as the app consumes it (the stored row, kind narrowed). */
export type Notification = Omit<NotificationRow, 'kind'> & { kind: NotificationKind }

type NotifyInput = { kind: NotificationKind; title: string; body?: string | null; link?: string | null }

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

/**
 * Best-effort notification to ONE role of a class (its tutors or its students):
 * resolves the membership and notifies that role, swallowing any failure. The
 * callers are core workflows (posting an announcement/assignment, turning in
 * work) that must never fail because of a notification, so this owns both the
 * membership fetch and the never-throw contract in one place.
 */
export async function notifyClassRoleBestEffort(
  classId: string,
  role: 'students' | 'tutors',
  input: NotifyInput,
): Promise<void> {
  try {
    const members = await getClassMembers(classId)
    await notifyBestEffort(
      members[role].map((m) => m.id),
      input,
    )
  } catch {
    // best-effort - never fail the caller's core action
  }
}

export async function listMyNotifications(profileId: string, limit = 30): Promise<Notification[]> {
  return (await selectRecentNotifications(profileId, limit)) as Notification[]
}

/** Unread count for the header badge (bounded - see UNREAD_BADGE_CAP). */
export const countUnreadNotifications = cache(async (profileId: string): Promise<number> => {
  return (await selectUnreadNotificationIds(profileId, UNREAD_BADGE_CAP)).length
})

/** Mark all of the caller's unread notifications read (self-scoped by RLS). */
export async function markAllNotificationsRead(actor: Profile): Promise<void> {
  await updateAllNotificationsRead(actor.id, new Date().toISOString())
}
