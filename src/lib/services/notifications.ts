import 'server-only'
import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { getClassMembers } from '@/lib/services/classes'
import { logError } from '@/lib/observability/log'
import { emailEnabled, escapeHtml } from '@/lib/email/resend'
import { enqueuePendingEmails } from '@/lib/data/pending-emails'
import { selectActiveMentorIdsForStudent, selectActiveMentorshipsForStudents } from '@/lib/data/mentorships'
import { selectMutedProfileIds } from '@/lib/data/notification-mutes'
import { isMutableNotificationKey } from '@/lib/notifications/keys'
import { getProfilesByIds } from '@/lib/services/users'
import {
  insertNotifications,
  selectNotificationsPage,
  selectUnreadNotificationIds,
  updateAllNotificationsRead,
  updateNotificationRead,
  type NotificationRow,
} from '@/lib/data/notifications'

/**
 * Notifications domain: who gets told what, and how the feed is read. All table
 * access goes through src/lib/data/notifications - this module holds no queries.
 */

type NotificationKind =
  | 'message'
  | 'grade'
  | 'announcement'
  | 'assignment'
  | 'submission'
  | 'resource'
  | 'attendance'
  | 'schedule'
  // Everything above is classroom activity. The kinds below are the rest of the app finally
  // reporting itself: what happens to an ACCOUNT (activated, revoked, restored, consent
  // withdrawn), to its CREDENTIALS, to money, to a mentorship, and to class membership.
  | 'account'
  | 'security'
  | 'finance'
  | 'mentorship'
  | 'class'

/** A notification as the app consumes it (the stored row, kind narrowed). */
export type Notification = Omit<NotificationRow, 'kind'> & { kind: NotificationKind }

type NotifyInput = {
  kind: NotificationKind
  title: string
  body?: string | null
  link?: string | null
  /** The key a person mutes this notice under, when it is not simply its kind (see
   *  notifications/keys.ts). */
  muteKey?: string
}

/** How many unread the badge will count before it just shows "9+". */
const UNREAD_BADGE_CAP = 50

/**
 * Notify each recipient once. Deduplicates ids and drops blanks, so callers can
 * pass a raw participant list. Throws on a write failure - use notifyBestEffort
 * from a core workflow that must not fail because of a notification.
 */
export async function notify(profileIds: string[], input: NotifyInput): Promise<void> {
  const ids = await withoutMuted([...new Set(profileIds)].filter(Boolean), input)
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
 * Drop the people who have muted this kind of notice. Done once, here, so the in-app row and the
 * email it mirrors go quiet together. A kind that cannot be muted (an account, credentials or money
 * notice) is never filtered, and a failed lookup delivers: a notice someone did not mute must not
 * be lost because the preference could not be read.
 */
async function withoutMuted(ids: string[], input: NotifyInput): Promise<string[]> {
  const key = input.muteKey ?? input.kind
  if (ids.length === 0 || !isMutableNotificationKey(key)) return ids
  try {
    const muted = await selectMutedProfileIds(key, ids)
    return muted.size === 0 ? ids : ids.filter((id) => !muted.has(id))
  } catch (error) {
    logError('notify.mutes', error, { key, recipients: ids.length }, { toSentry: false })
    return ids
  }
}

/**
 * Email channel: mirrors the just-written in-app notification to email. OFF unless
 * emailEnabled() (opt-in flag + RESEND_API_KEY + EMAIL_FROM), so the pipeline stays
 * email-ready without a provider. Resolves each recipient's address, renders the
 * message once (title/body HTML-escaped, link absolutised via NEXT_PUBLIC_APP_URL),
 * and ENQUEUES a row per recipient - the drain route sends via Resend off the
 * request path. Never fails the core action.
 */
async function deliverEmailNotifications(profileIds: string[], input: NotifyInput): Promise<void> {
  if (!emailEnabled()) return
  const profiles = await getProfilesByIds(profileIds)
  const link = input.link ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${input.link}` : null
  const html =
    `<p>${escapeHtml(input.body ?? input.title)}</p>` +
    (link ? `<p><a href="${escapeHtml(link)}">Open in Cert-Ed</a></p>` : '')
  const emails = [...profiles.values()].map((p) => p.email).filter((e): e is string => !!e)
  // Queue one rendered row per recipient instead of awaiting N Resend calls on the
  // request path, so a many-recipient announcement never blocks it. The drain route
  // sends them in the background.
  await enqueuePendingEmails(emails.map((to_email) => ({ to_email, subject: input.title, html })))
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

/** The people around a class a notification can address. Mentors are those of its enrolled students. */
type ClassAudience = 'students' | 'tutors' | 'mentors'

/**
 * Best-effort notification to one or more audiences of a class (its students, its tutors, the
 * mentors of its students): resolves the membership and notifies it, swallowing any failure. The
 * callers are core workflows (posting an announcement/assignment, turning in work) that must never
 * fail because of a notification, so this owns both the membership fetch and the never-throw
 * contract in one place.
 *
 * `exceptId` leaves out whoever made the change - they were there. A person in two audiences is
 * told once.
 */
export async function notifyClassRoleBestEffort(
  classId: string,
  audience: ClassAudience | ClassAudience[],
  input: NotifyInput,
  exceptId?: string | null,
): Promise<void> {
  try {
    const audiences = Array.isArray(audience) ? audience : [audience]
    const members = await getClassMembers(classId)
    const ids = new Set<string>()
    for (const role of audiences) {
      if (role === 'mentors') {
        const pairs = await selectActiveMentorshipsForStudents(members.students.map((m) => m.id))
        for (const pair of pairs) ids.add(pair.mentor_id)
      } else {
        for (const member of members[role]) ids.add(member.id)
      }
    }
    if (exceptId) ids.delete(exceptId)
    await notifyBestEffort([...ids], input)
  } catch (error) {
    // best-effort - never fail the caller's core action, but log the failure.
    logError('notifyClassRoleBestEffort', error, { classId, audience, kind: input.kind }, { toSentry: false })
  }
}

/**
 * Best-effort notice to the mentors of ONE student, phrased about that student: the mentor of a
 * student is a party to what happens to them, but a notice written to the student ("Your work was
 * graded") would read wrongly to them, so the copy is built from the student's name here. `exceptId`
 * leaves out whoever made the change.
 */
export async function notifyMentorsOfStudentBestEffort(
  studentId: string,
  build: (studentName: string) => NotifyInput,
  exceptId?: string | null,
): Promise<void> {
  try {
    const mentorIds = (await selectActiveMentorIdsForStudent(studentId)).filter((id) => id !== exceptId)
    if (mentorIds.length === 0) return
    const student = (await getProfilesByIds([studentId])).get(studentId)
    await notifyBestEffort(mentorIds, build(student?.full_name ?? student?.email ?? 'Your mentee'))
  } catch (error) {
    logError('notifyMentorsOfStudentBestEffort', error, { studentId }, { toSentry: false })
  }
}

export const NOTIFICATIONS_PAGE_SIZE = 30

export async function listMyNotifications(
  profileId: string,
  opts: { page: number; pageSize?: number; kind?: string; read?: 'read' | 'unread' } = { page: 1 },
): Promise<{ items: Notification[]; total: number }> {
  const { items, total } = await selectNotificationsPage(profileId, {
    page: opts.page,
    pageSize: opts.pageSize ?? NOTIFICATIONS_PAGE_SIZE,
    kind: opts.kind,
    read: opts.read,
  })
  return { items: items as Notification[], total }
}

/** Unread count for the header badge (bounded - see UNREAD_BADGE_CAP). */
export const countUnreadNotifications = cache(async (profileId: string): Promise<number> => {
  return (await selectUnreadNotificationIds(profileId, UNREAD_BADGE_CAP)).length
})

/** Mark ONE of the caller's notifications read. Scoped to the caller, so an id belonging to
 *  somebody else simply matches nothing. */
export async function markNotificationRead(actor: Profile, id: string): Promise<void> {
  await updateNotificationRead(actor.id, id, new Date().toISOString())
}

/** Mark all of the caller's unread notifications read (self-scoped by RLS). */
export async function markAllNotificationsRead(actor: Profile): Promise<void> {
  await updateAllNotificationsRead(actor.id, new Date().toISOString())
}
