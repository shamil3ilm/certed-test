import 'server-only'
import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { getClassMembers } from '@/lib/services/classes'
import { logError } from '@/lib/observability/log'
import { emailEnabled, sendEmail, escapeHtml } from '@/lib/email/resend'
import { getProfilesByIds } from '@/lib/services/users'
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

/**
 * Email channel: mirrors the just-written in-app notification to email via Resend
 * (src/lib/email/resend). OFF unless emailEnabled() (opt-in flag + RESEND_API_KEY +
 * EMAIL_FROM), so the pipeline stays email-ready without a provider. Resolves each
 * recipient's address and sends best-effort; title/body are HTML-escaped and the
 * link is absolutised via NEXT_PUBLIC_APP_URL. Never fails the core action.
 */
async function deliverEmailNotifications(profileIds: string[], input: NotifyInput): Promise<void> {
  if (!emailEnabled()) return
  const profiles = await getProfilesByIds(profileIds)
  const link = input.link ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${input.link}` : null
  const html =
    `<p>${escapeHtml(input.body ?? input.title)}</p>` +
    (link ? `<p><a href="${escapeHtml(link)}">Open in Cert-Ed</a></p>` : '')
  const emails = [...profiles.values()].map((p) => p.email).filter((e): e is string => !!e)
  await Promise.all(emails.map((email) => sendEmail(email, input.title, html)))
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
    logError('notifyBestEffort', error, { kind: input.kind, recipients: profileIds.length }, { toSentry: false })
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
    logError('notifyClassRoleBestEffort', error, { classId, role, kind: input.kind }, { toSentry: false })
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
