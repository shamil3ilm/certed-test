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
  return announcement
}

/**
 * Tells a class's students that something was posted. Best-effort by design:
 * a notification failure must never fail the post itself, which is already
 * committed by the time this runs.
 *
 * Academy-wide announcements are deliberately NOT fanned out - they'd notify
 * every account in the academy.
 */
async function notifyClassOfPost(announcement: Announcement): Promise<void> {
  if (!announcement.class_id) return
  // A post scheduled for the future isn't live yet, so don't notify about it now.
  // (A publish-time scheduler would send it when it goes live; not built here.)
  if (announcement.publish_at && Date.parse(announcement.publish_at) > Date.now()) return
  await notifyClassRoleBestEffort(announcement.class_id, 'students', {
    kind: 'announcement',
    title: `New announcement: ${announcement.title}`,
    body: announcement.message.slice(0, 140),
    link: `/classroom/${announcement.class_id}`,
  })
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
  })
  await auditPrivilegedAction(actor, 'announcement.create', 'announcement', created.id)
  await notifyClassOfPost(created)
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
  await requireManageable(actor, id)
  await updateAnnouncement(id, { status: 'archived' })
  await auditPrivilegedAction(actor, 'announcement.archive', 'announcement', id)
}

export async function restoreAnnouncement(actor: Profile, id: string): Promise<void> {
  throttleWrite('announcement', actor.id, 'announcement')
  const announcement = await requireManageable(actor, id)
  // Restoring re-activates content on the class, so hold it to the same rule as
  // createAnnouncement: no active content on an archived (soft-deleted) class.
  // (editAnnouncement is deliberately not gated - editing an already-active post
  // in place doesn't re-surface anything, matching the calendar in-place edits.)
  if (announcement.class_id) await assertClassActive(announcement.class_id)
  await updateAnnouncement(id, { status: 'active' })
  await auditPrivilegedAction(actor, 'announcement.restore', 'announcement', id)
}

export async function editAnnouncement(actor: Profile, id: string, patch: AnnouncementEditPatch): Promise<void> {
  throttleWrite('announcement', actor.id, 'announcement')
  await requireManageable(actor, id)
  await updateAnnouncement(id, patch)
  await auditPrivilegedAction(actor, 'announcement.edit', 'announcement', id)
}

export async function editAnnouncementFromActionInput(
  actor: Profile,
  input: EditAnnouncementActionInput,
): Promise<void> {
  const { id, patch } = validateEditAnnouncementInput(input)
  await editAnnouncement(actor, id, patch)
}
