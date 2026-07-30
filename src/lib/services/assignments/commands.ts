import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass, assertClassActive } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { getClassMembers } from '@/lib/services/classes'
import { notifyBestEffort } from '@/lib/services/notifications'
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
  validateArchiveAssignmentInput,
  validateCreateAssignmentInput,
  validateEditAssignmentInput,
  type ArchiveAssignmentActionInput,
  type CreateAssignmentApiInput,
  type CreateAssignmentInput,
  type EditAssignmentActionInput,
} from './validation'

/** Creating, archiving and editing an assignment. Every write is gated on
 *  canManageClass and audited, and throttled under one per-user budget
 *  (throttleWrite) - the edit path is the heaviest, driving a service-role
 *  reclassify RPC, so it must be capped like create. Reads live in ./queries. */

/**
 * Explicit canManageClass gate - the route this replaces relied on RLS alone
 * for insert authorization; every other write path in the app double-checks
 * app-side too, so this closes that inconsistency (a hardening change, not
 * just a mechanical move).
 */
export async function createAssignment(actor: Profile, input: CreateAssignmentInput): Promise<Assignment> {
  throttleWrite('assignment', actor.id, 'assignment')
  if (!(await canManageClass(actor, input.class_id))) {
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
    status: 'active',
    created_by: actor.id,
  })
  await auditPrivilegedAction(actor, 'assignment.create', 'assignment', created.id)
  await notifyClassOfAssignment(created)
  return created
}

/**
 * Tell a class's students that new work was posted - previously they only found
 * out by visiting Classwork. Best-effort by design (mirrors the announcement
 * post): the assignment is already committed, so a notification failure must
 * never fail creation.
 */
async function notifyClassOfAssignment(assignment: Assignment): Promise<void> {
  try {
    const members = await getClassMembers(assignment.class_id)
    await notifyBestEffort(
      members.students.map((s) => s.id),
      {
        kind: 'assignment',
        title: `New assignment: ${assignment.title}`,
        body: assignment.description ? assignment.description.slice(0, 140) : null,
        link: `/classroom/${assignment.class_id}/classwork#assignment-${assignment.id}`,
      },
    )
  } catch {
    // best-effort - never fail creating the assignment
  }
}

export async function createAssignmentFromApiInput(
  actor: Profile,
  input: CreateAssignmentApiInput,
): Promise<Assignment> {
  return createAssignment(actor, validateCreateAssignmentInput(input))
}

/** Resolves an assignment and proves the actor may manage its class. Authorizing
 *  against the assignment's OWN class - never a client-supplied class id. */
async function requireManageable(actor: Profile, id: string): Promise<Assignment> {
  const assignment = await getAssignment(id)
  if (!assignment) throw new NotFoundError('Assignment not found')
  if (!(await canManageClass(actor, assignment.class_id))) {
    throw new PermissionError('Not authorized for this assignment')
  }
  return assignment
}

/** Soft archive / restore (reversible). */
export async function archiveAssignment(actor: Profile, id: string, status: 'active' | 'archived'): Promise<void> {
  throttleWrite('assignment', actor.id, 'assignment')
  await requireManageable(actor, id)
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
    // verdicts in ONE database transaction (edit_assignment_and_reclassify,
    // migration 0026), so the two can never disagree - no app-side rollback, no
    // stale-snapshot overwrite. The full field set is sent (patch value where
    // present, else the current value) since the RPC rewrites the whole row.
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
    // enforce_deadline is orthogonal to lateness, so it isn't part of the
    // reclassify RPC - apply it directly so a same-edit toggle still takes effect.
    if (patch.enforce_deadline !== undefined) {
      await updateAssignment(id, { enforce_deadline: patch.enforce_deadline })
    }
  } else {
    await updateAssignment(id, patch)
  }

  await auditPrivilegedAction(actor, 'assignment.edit', 'assignment', id)
}

export async function editAssignmentFromActionInput(actor: Profile, input: EditAssignmentActionInput): Promise<void> {
  const parsed = validateEditAssignmentInput(input)
  await editAssignment(actor, parsed.id, parsed.patch)
}
