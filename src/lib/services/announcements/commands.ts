import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { assertClassActive } from '@/lib/permission'
import { canWriteClass } from '@/lib/permission/class-write'
import { notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError } from '@/lib/errors'
import { throttleWrite } from '@/lib/security/throttle'
import { insertAnnouncement, updateAnnouncement } from '@/lib/data/announcements'
import { getAnnouncement, type Announcement } from './queries'
import {
  validateCreateAnnouncementInput,
  validateEditAnnouncementInput,
  type AnnouncementEditPatch,
  type CreateAnnouncementActionInput,
  type CreateAnnouncementInput,
  type EditAnnouncementActionInput,
} from './validation'

/** Posting, editing and archiving announcements. Every write is gated on
 *  canWriteClass - the post's own class, or academy-wide for an admin. */

/** Loads the announcement and checks the caller may manage its scope (its own
 *  class, or academy-wide if admin) - throws instead of returning a boolean
 *  so every caller gets the same NotFoundError/PermissionError distinction. */
async function requireManageable(actor: Profile, id: string): Promise<Announcement> {
  const announcement = await getAnnouncement(id)
  if (!announcement) throw new NotFoundError('Announcement not found')
  // canWriteClass, NOT canManageScope: the latter resolves to canManageClass, which admits
  // a MENTOR over a mentee's class - but the RLS policies behind these writes are the
  // TUTOR-ONLY teaches_class_write (0079/0092), so the app said yes and Postgres said no,
  // surfacing as a raw RLS error instead of a clean PermissionError (and passing outright
  // in mock mode, which has no RLS). canWriteClass treats a null class the same way -
  // academy-wide is admin-only - so the academy-wide path is unchanged.
  if (!(await canWriteClass(actor, announcement.class_id))) {
    throw new PermissionError('Not authorized for this announcement')
  }
  // Returned as a COPY: callers compare this row against the patch AFTER the write to decide whether
  // anyone is told, and a store that updates the row it handed back in place (the mock one does) would
  // otherwise show them nothing changed.
  return { ...announcement }
}

/**
 * Tells a class - its students, its tutors and the mentors of its students - that something was
 * posted, everyone but the author. Best-effort by design:
 * a notification failure must never fail the post itself, which is already
 * committed by the time this runs.
 *
 * Academy-wide announcements are deliberately NOT fanned out - they'd notify
 * every account in the academy.
 */
export async function notifyClassOfPost(
  announcement: Pick<Announcement, 'class_id' | 'publish_at' | 'title' | 'message'>,
  authorId: string,
  change:
    | 'New announcement'
    | 'Announcement updated'
    | 'Announcement withdrawn'
    | 'Announcement restored' = 'New announcement',
): Promise<void> {
  if (!announcement.class_id) return
  // A post scheduled for the future isn't live yet, so don't notify about it now.
  // (A publish-time scheduler would send it when it goes live; not built here.)
  if (announcement.publish_at && Date.parse(announcement.publish_at) > Date.now()) return
  await notifyClassRoleBestEffort(
    announcement.class_id,
    ['students', 'tutors', 'mentors'],
    {
      kind: 'announcement',
      title: `${change}: ${announcement.title}`,
      body: announcement.message.slice(0, 140),
      link: `/classroom/${announcement.class_id}`,
    },
    authorId,
  )
}

/** A class post is live when it has no publish time or the time has passed. */
function isLiveNow(publishAt: string | null): boolean {
  return !publishAt || Date.parse(publishAt) <= Date.now()
}

export async function createAnnouncement(actor: Profile, input: CreateAnnouncementInput): Promise<Announcement> {
  throttleWrite('announcement', actor.id, 'announcement')
  if (!(await canWriteClass(actor, input.class_id))) {
    throw new PermissionError('Not authorized for this class')
  }
  if (input.class_id) await assertClassActive(input.class_id)
  // Set status explicitly rather than leaning on the DB default, so mock mode
  // (which doesn't apply column defaults) also creates an active announcement.
  const created = await insertAnnouncement({
    class_id: input.class_id,
    title: input.title,
    message: input.message,
    attachments: input.attachments,
    publish_at: input.publish_at,
    expires_at: input.expires_at,
    author_id: actor.id,
    status: 'active',
    // A post written live is announced by this write; stamping it keeps the go-live sweep from
    // announcing it again. A scheduled one stays unstamped until the sweep tells its class.
    live_notified_at: input.class_id && isLiveNow(input.publish_at) ? new Date().toISOString() : null,
  })
  await auditPrivilegedAction(actor, 'announcement.create', 'announcement', created.id)
  await notifyClassOfPost(created, actor.id)
  return created
}

export async function createAnnouncementFromActionInput(
  actor: Profile,
  input: CreateAnnouncementActionInput,
): Promise<Announcement> {
  return createAnnouncement(actor, validateCreateAnnouncementInput(input))
}

export async function archiveAnnouncement(actor: Profile, id: string): Promise<void> {
  throttleWrite('announcement', actor.id, 'announcement')
  const announcement = await requireManageable(actor, id)
  await updateAnnouncement(id, { status: 'archived' })
  await auditPrivilegedAction(actor, 'announcement.archive', 'announcement', id)
  // A post that was live and now is not: people who read it should not be left acting on it.
  if (announcement.status === 'active') await notifyClassOfPost(announcement, actor.id, 'Announcement withdrawn')
}

export async function restoreAnnouncement(actor: Profile, id: string): Promise<void> {
  throttleWrite('announcement', actor.id, 'announcement')
  const announcement = await requireManageable(actor, id)
  // Restoring re-activates content on the class, so hold it to the same rule as
  // createAnnouncement: no active content on an archived (soft-deleted) class.
  // (editAnnouncement is deliberately not gated - editing an already-active post
  // in place doesn't re-surface anything, matching the calendar in-place edits.)
  if (announcement.class_id) await assertClassActive(announcement.class_id)
  // A post restored after it went live is announced here as restored; stamping it stops the sweep
  // announcing it again as new.
  const stamp =
    announcement.class_id && !announcement.live_notified_at && isLiveNow(announcement.publish_at)
      ? { live_notified_at: new Date().toISOString() }
      : {}
  await updateAnnouncement(id, { status: 'active', ...stamp })
  await auditPrivilegedAction(actor, 'announcement.restore', 'announcement', id)
  await notifyClassOfPost(announcement, actor.id, 'Announcement restored')
}

export async function editAnnouncement(actor: Profile, id: string, patch: AnnouncementEditPatch): Promise<void> {
  throttleWrite('announcement', actor.id, 'announcement')
  const existing = await requireManageable(actor, id)
  await updateAnnouncement(id, patch)
  await auditPrivilegedAction(actor, 'announcement.edit', 'announcement', id)
  // Only a live post whose words changed: a new expiry or a re-attached file tells no one anything.
  if (existing.status === 'active' && (existing.title !== patch.title || existing.message !== patch.message)) {
    await notifyClassOfPost(
      { ...existing, title: patch.title, message: patch.message },
      actor.id,
      'Announcement updated',
    )
  }
}

export async function editAnnouncementFromActionInput(
  actor: Profile,
  input: EditAnnouncementActionInput,
): Promise<void> {
  const { id, patch } = validateEditAnnouncementInput(input)
  await editAnnouncement(actor, id, patch)
}
