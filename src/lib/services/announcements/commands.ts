import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canManageScope } from '@/lib/permission'
import { getClassMembers } from '@/lib/services/classes'
import { notifyBestEffort } from '@/lib/services/notifications'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError } from '@/lib/errors'
import { insertAnnouncement, updateAnnouncement } from '@/lib/data/announcements'
import { getAnnouncement, type Announcement } from './queries'
import {
  validateCreateAnnouncementInput,
  validateEditAnnouncementInput,
  type CreateAnnouncementActionInput,
  type CreateAnnouncementInput,
  type EditAnnouncementActionInput,
} from './validation'

/** Posting, editing and archiving announcements. Every write is gated on
 *  canManageScope - the post's own class, or academy-wide for an admin. */

/** Loads the announcement and checks the caller may manage its scope (its own
 *  class, or academy-wide if admin) - throws instead of returning a boolean
 *  so every caller gets the same NotFoundError/PermissionError distinction. */
async function requireManageable(actor: Profile, id: string): Promise<Announcement> {
  const announcement = await getAnnouncement(id)
  if (!announcement) throw new NotFoundError('Announcement not found')
  if (!(await canManageScope(actor, announcement.class_id))) {
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
  try {
    const members = await getClassMembers(announcement.class_id)
    await notifyBestEffort(
      members.students.map((s) => s.id),
      {
        kind: 'announcement',
        title: `New announcement: ${announcement.title}`,
        body: announcement.message.slice(0, 140),
        link: `/classroom/${announcement.class_id}`,
      },
    )
  } catch {
    // best-effort - never fail posting the announcement
  }
}

export async function createAnnouncement(actor: Profile, input: CreateAnnouncementInput): Promise<Announcement> {
  if (!(await canManageScope(actor, input.class_id))) {
    throw new PermissionError('Not authorized for this class')
  }
  // Set status explicitly rather than leaning on the DB default, so mock mode
  // (which doesn't apply column defaults) also creates an active announcement.
  const created = await insertAnnouncement({
    class_id: input.class_id,
    title: input.title,
    message: input.message,
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
  await requireManageable(actor, id)
  await updateAnnouncement(id, { status: 'archived' })
  await auditPrivilegedAction(actor, 'announcement.archive', 'announcement', id)
}

export async function restoreAnnouncement(actor: Profile, id: string): Promise<void> {
  await requireManageable(actor, id)
  await updateAnnouncement(id, { status: 'active' })
  await auditPrivilegedAction(actor, 'announcement.restore', 'announcement', id)
}

export async function editAnnouncement(
  actor: Profile,
  id: string,
  patch: { title: string; message: string },
): Promise<void> {
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
