import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canWriteClass, assertClassActive } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { PermissionError, NotFoundError } from '@/lib/errors'
import { throttleWrite } from '@/lib/security/throttle'
import {
  callEditAssignmentAndReclassify as editAssignmentAndReclassify,
  insertAssignment,
  updateAssignment,
  updateAssignmentStatus,
  type AssignmentPatch,
} from '@/lib/data/assignments'
import { getAssignment, type Assignment } from './queries'
import {
  defaultExpectsSubmission,
  validateArchiveAssignmentInput,
  validateCreateAssignmentInput,
  validateEditAssignmentInput,
  type ArchiveAssignmentActionInput,
  type CreateAssignmentApiInput,
  type CreateAssignmentInput,
  type EditAssignmentActionInput,
} from './validation'

/** Creating, archiving and editing an assignment. Every write is gated on
 *  canWriteClass and audited, and throttled under one per-user budget
 *  (throttleWrite) - the edit path is the heaviest, driving a service-role
 *  reclassify RPC, so it must be capped like create. Reads live in ./queries. */

/**
 * Explicit canWriteClass gate - the route this replaces relied on RLS alone
 * for insert authorization; every other write path in the app double-checks
 * app-side too, so this closes that inconsistency (a hardening change, not
 * just a mechanical move).
 */
export async function createAssignment(actor: Profile, input: CreateAssignmentInput): Promise<Assignment> {
  throttleWrite('assignment', actor.id, 'assignment')
  if (!(await canWriteClass(actor, input.class_id))) {
    throw new PermissionError('Not allowed to create an assignment for this class.')
  }
  await assertClassActive(input.class_id)
  const created = await insertAssignment({
    class_id: input.class_id,
    title: input.title,
    description: input.description,
    due_date: input.due_date,
    attachment_drive_link: input.attachment_drive_link ?? null,
    topic: input.topic ?? null,
    max_marks: input.max_marks ?? null,
    enforce_deadline: input.enforce_deadline ?? false,
    type: input.type ?? 'assignment',
    expects_submission: input.expects_submission ?? defaultExpectsSubmission(input.type ?? 'assignment'),
    ends_at: input.ends_at ?? null,
    status: 'active',
    created_by: actor.id,
  })
  await auditPrivilegedAction(actor, 'assignment.create', 'assignment', created.id)
  await notifyClassOfAssignment(created)
  return created
}

/**
 * Tell a class's students that new work was posted, so they see it without
 * having to visit Classwork. Best-effort by design (mirrors the announcement
 * post): the assignment is already committed, so a notification failure must
 * never fail creation.
 */
async function notifyClassOfAssignment(assignment: Assignment): Promise<void> {
  // "New exam: ..." / "New quiz: ..." reads better than a blanket "assignment" for
  // the typed kinds; the notification's routing `kind` stays 'assignment'.
  const label = assignment.type === 'assignment' ? 'assignment' : assignment.type
  await notifyClassRoleBestEffort(assignment.class_id, 'students', {
    kind: 'assignment',
    title: `New ${label}: ${assignment.title}`,
    body: assignment.description ? assignment.description.slice(0, 140) : null,
    link: `/classroom/${assignment.class_id}/classwork#assignment-${assignment.id}`,
  })
}

export async function createAssignmentFromApiInput(
  actor: Profile,
  input: CreateAssignmentApiInput,
): Promise<Assignment> {
  return createAssignment(actor, validateCreateAssignmentInput(input))
}

/** Resolves an assignment and proves the actor may WRITE its class. Uses canWriteClass
 *  (admin or tutor-of-class, mirroring the assignments teaches_class_write RLS) and NOT
 *  canManageClass - a mentor's oversight, even with a manageClassContent override, must
 *  not reach content edits. This matters because the due-date-change edit path writes via
 *  the service role (RLS-bypassing), so this app guard is the only gate there.
 *  Authorizing against the assignment's OWN class - never a client-supplied class id. */
async function requireManageable(actor: Profile, id: string): Promise<Assignment> {
  const assignment = await getAssignment(id)
  if (!assignment) throw new NotFoundError('Assignment not found')
  if (!(await canWriteClass(actor, assignment.class_id))) {
    throw new PermissionError('Not authorized for this assignment')
  }
  return assignment
}

/** Soft archive / restore (reversible). */
export async function archiveAssignment(actor: Profile, id: string, status: 'active' | 'archived'): Promise<void> {
  throttleWrite('assignment', actor.id, 'assignment')
  const assignment = await requireManageable(actor, id)
  // Restoring (status 'active') re-activates content, so hold it to the same rule
  // as createAssignment: no active assignment on an archived (soft-deleted) class.
  // Archiving is always allowed.
  if (status === 'active') await assertClassActive(assignment.class_id)
  await updateAssignmentStatus(id, status)
  await auditPrivilegedAction(actor, `assignment.${status === 'active' ? 'restore' : 'archive'}`, 'assignment', id)
}

export async function archiveAssignmentFromActionInput(
  actor: Profile,
  input: ArchiveAssignmentActionInput,
): Promise<void> {
  const parsed = validateArchiveAssignmentInput(input)
  await archiveAssignment(actor, parsed.id, parsed.status)
}

export async function editAssignment(actor: Profile, id: string, patch: AssignmentPatch): Promise<void> {
  throttleWrite('assignment', actor.id, 'assignment')
  const existing = await requireManageable(actor, id)

  // Compare the deadlines as INSTANTS, not raw strings: patch.due_date is an
  // ...T10:00:00.000Z ISOString while existing.due_date comes back from
  // PostgREST as ...T10:00:00+00:00. They can denote the same moment yet differ
  // as text, which would send a title-only edit down the heavy service-role
  // reclassify path on nearly every save. (Kept inline so TS narrows due_date.)
  if (patch.due_date !== undefined && new Date(patch.due_date).getTime() !== new Date(existing.due_date).getTime()) {
    // A moved deadline invalidates every stamped on-time/late verdict on this
    // assignment's submissions. Update the assignment AND re-derive those
    // verdicts in one database transaction, so the two can never disagree. The
    // full field set is sent (patch value where present, else the current
    // value) since the RPC rewrites the whole row.
    const field = <K extends keyof AssignmentPatch>(key: K): NonNullable<AssignmentPatch[K]> | null =>
      (patch[key] !== undefined ? patch[key] : (existing[key as keyof Assignment] as AssignmentPatch[K])) ?? null
    await editAssignmentAndReclassify(id, {
      title: field('title') ?? existing.title,
      description: field('description'),
      due_date: patch.due_date,
      attachment_drive_link: field('attachment_drive_link'),
      topic: field('topic'),
      max_marks: field('max_marks'),
    })
    // enforce_deadline + the classwork-type fields are orthogonal to lateness, so
    // they aren't part of the reclassify RPC - apply any that changed directly, so a
    // same-edit toggle still takes effect.
    const extra: AssignmentPatch = {}
    if (patch.enforce_deadline !== undefined) extra.enforce_deadline = patch.enforce_deadline
    if (patch.type !== undefined) extra.type = patch.type
    if (patch.expects_submission !== undefined) extra.expects_submission = patch.expects_submission
    if (patch.ends_at !== undefined) extra.ends_at = patch.ends_at
    if (Object.keys(extra).length > 0) await updateAssignment(id, extra)
  } else {
    await updateAssignment(id, patch)
  }

  await auditPrivilegedAction(actor, 'assignment.edit', 'assignment', id)
}

export async function editAssignmentFromActionInput(actor: Profile, input: EditAssignmentActionInput): Promise<void> {
  const parsed = validateEditAssignmentInput(input)
  await editAssignment(actor, parsed.id, parsed.patch)
}
