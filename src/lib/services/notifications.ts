import 'server-only'
import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { getClassMembers } from '@/lib/services/classes'
import { logError } from '@/lib/observability/log'
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

type NotificationKind =
  'message' | 'grade' | 'announcement' | 'assignment' | 'submission' | 'resource' | 'attendance' | 'schedule'

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
  // In-app is the source of truth and just succeeded; fan the same event out to
  // email best-effort (never fails the in-app write).
  await dispatchEmail(ids, input)
}

/** Whether email delivery is wired. Off until a provider + org opt-in exist, so
 *  the rest of the system is email-ready without one. */
function emailNotificationsEnabled(): boolean {
  return process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true'
}

/**
 * Email channel (future-ready). THE single
 * extension point: when an email provider is added, resolve each profile's
 * address + per-user preference here and send. Kept a no-op until then, so the
 * whole notification pipeline is email-ready without a provider. Always
 * best-effort - email must never fail the core action or the in-app write.
 */
async function deliverEmailNotifications(_profileIds: string[], _input: NotifyInput): Promise<void> {
  if (!emailNotificationsEnabled()) return
  // TODO: resolve verified addresses + per-user email preferences, then send via
  // the provider (Resend / SES / ...). Intentionally unimplemented.
}

async function dispatchEmail(profileIds: string[], input: NotifyInput): Promise<void> {
  try {
    await deliverEmailNotifications(profileIds, input)
  } catch (error) {
    logError('notify.email', error, { kind: input.kind, recipients: profileIds.length })
  }
}

/** Fire-and-forget wrapper: notify without ever throwing into the caller's flow.
 *  Notifications are a non-critical side effect - sending a message or saving a
 *  grade must still succeed if the notification write fails. */
export async function notifyBestEffort(profileIds: string[], input: NotifyInput): Promise<void> {
  try {
    await notify(profileIds, input)
  } catch (error) {
    // deliberately swallowed - see the contract above - but logged so a failing
    // notification write is diagnosable rather than invisible.
    logError('notifyBestEffort', error, { kind: input.kind, recipients: profileIds.length })
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
  } catch (error) {
    // best-effort - never fail the caller's core action, but log the failure.
    logError('notifyClassRoleBestEffort', error, { classId, role, kind: input.kind })
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
