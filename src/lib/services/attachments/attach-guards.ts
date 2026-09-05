import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { NotFoundError, PermissionError, ValidationError } from '@/lib/errors'
import { selectSubmissionStateAsService } from '@/lib/data/submissions-service-reads'
import { selectAssignmentClassIdAsService, selectAssignmentStateAsService } from '@/lib/data/assignments'
import { selectResourceForAttachAsService } from '@/lib/data/resources'
import { selectActiveAttachmentsForOwner, type AttachmentOwner } from '@/lib/data/attachments'
import { MAX_ATTACHMENTS_PER_OWNER } from '@/lib/attachments/validation'
import { assertCanDocument } from '@/lib/permission/documents'
import { assertClassActive } from '@/lib/permission/class'
import { selectAnnouncementClassIdAsService } from '@/lib/data/announcements'
import { canWriteClass } from '@/lib/permission/class-write'

/**
 * Per-owner state gates for /api/attachments. Attaching a file is a state-changing
 * write on the owner, so it MUST honour the same rules as the owner's first-class
 * write paths - ownership alone (the old check) let a student attach after the
 * deadline / after grading, and let a tutor swap the file on a document they didn't
 * upload. All reads are service-role: an attach can be legitimate on a row the caller
 * can't RLS-see, and a missing owner is a 404, never a hint that it exists.
 */

/**
 * Adding a file to an EXISTING submission - the file IS the student's work, so this
 * mirrors recordSubmission/withdrawSubmission: own + still-active + ungraded, on an
 * active assignment whose hard deadline (if enabled) has not passed. Kept as ONE
 * function so this fourth submission-write path can't drift from the rule again.
 */
export async function assertSubmissionAcceptsWork(actor: Profile, submissionId: string): Promise<void> {
  const sub = await selectSubmissionStateAsService(submissionId)
  if (!sub) throw new NotFoundError()
  if (sub.student_id !== actor.id) throw new PermissionError('Not allowed to attach to this submission.')
  if (!sub.is_active) throw new ValidationError('That submission was replaced or withdrawn.')
  if (sub.score != null || sub.graded_at != null) {
    throw new ValidationError('Graded work cannot be changed - ask your tutor to reopen it.')
  }
  const assignment = await selectAssignmentStateAsService(sub.assignment_id)
  if (!assignment || assignment.status !== 'active') throw new NotFoundError()
  if (assignment.enforce_deadline && Date.parse(assignment.due_date) < Date.now()) {
    throw new ValidationError('This assignment is closed - its deadline has passed.')
  }
}

/**
 * A guardrail against runaway/spam uploads: cap the number of ACTIVE attachments on an
 * owner. Applied to the purely-additive owners (submission / assignment / announcement);
 * resources are NOT capped here because a document replace supersedes its prior file, so
 * its active count stays at one and a cap would wrongly freeze it. Enforced server-side
 * because the UI hide is bypassable via a direct PostgREST/API call.
 */
export async function assertUnderAttachmentCap(owner: AttachmentOwner): Promise<void> {
  const existing = await selectActiveAttachmentsForOwner(owner)
  if (existing.length >= MAX_ATTACHMENTS_PER_OWNER) {
    throw new ValidationError(`You can attach at most ${MAX_ATTACHMENTS_PER_OWNER} files here.`)
  }
}

/**
 * Adding a file to a class document. Replacing an existing attachment is an EDIT (so a
 * tutor may only replace a document they uploaded - the `own` rule); the FIRST attach
 * on a just-created document is an upload. Also refuses an archived document or a
 * document on an archived class, which every first-class document write refuses.
 *
 * Returns whether this attach REPLACES an existing file, so the caller records the
 * swap (version snapshot + resource.edit audit), matching editDocument's Drive-link path.
 */
export async function assertMayAttachToResource(actor: Profile, resourceId: string): Promise<boolean> {
  const resource = await selectResourceForAttachAsService(resourceId)
  if (!resource) throw new NotFoundError()
  if (!resource.class_id) throw new PermissionError('Not allowed to attach to this document.')
  if (resource.status !== 'active') {
    throw new ValidationError('That document is archived - restore it before changing its file.')
  }
  await assertClassActive(resource.class_id)

  const existing = await selectActiveAttachmentsForOwner({ kind: 'resource', id: resourceId })
  const isReplacement = existing.length > 0
  await assertCanDocument(actor, isReplacement ? 'edit' : 'upload', {
    class_id: resource.class_id,
    uploaded_by: resource.uploaded_by,
    visibility: resource.visibility,
  })
  return isReplacement
}

/**
 * The single per-owner authorization decision for an attachment upload: dispatches to the
 * right guard for each owner kind and reports whether the write REPLACES a resource's
 * current file. Lives here beside its per-kind siblings rather than in the route handler -
 * a transport adapter should delegate to a named domain function, not implement the
 * workflow itself.
 *
 * Class-owned kinds (assignment, announcement) gate on canWriteClass, the tutor-only
 * mirror of `teaches_class_write` that the owners' own write policies use, so this guard
 * cannot be looser than the DB.
 */
export async function assertMayAttach(
  actor: Profile,
  owner: AttachmentOwner,
): Promise<{ replacedResourceId: string | null }> {
  if (owner.kind === 'submission') {
    await assertSubmissionAcceptsWork(actor, owner.id)
    await assertUnderAttachmentCap(owner)
    return { replacedResourceId: null }
  }
  if (owner.kind === 'resource') {
    // NOT cap-checked: a resource replace supersedes its prior file, so its active count
    // stays at one - capping it would freeze the document after N edits.
    const isReplacement = await assertMayAttachToResource(actor, owner.id)
    return { replacedResourceId: isReplacement ? owner.id : null }
  }
  const classOwner =
    owner.kind === 'assignment'
      ? await selectAssignmentClassIdAsService(owner.id)
      : await selectAnnouncementClassIdAsService(owner.id)
  if (!classOwner) throw new NotFoundError()
  if (!(await canWriteClass(actor, classOwner.class_id))) {
    throw new PermissionError(`Not allowed to attach to this ${owner.kind}.`)
  }
  await assertUnderAttachmentCap(owner)
  return { replacedResourceId: null }
}
