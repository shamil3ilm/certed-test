import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError } from '@/lib/errors'
import {
  insertAssignment,
  updateAssignment,
  updateAssignmentStatus,
  type AssignmentPatch,
} from '@/lib/data/assignments'
import { getAssignment, type Assignment } from './queries'
import { reclassifySubmissions } from './reclassify'
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
 *  canManageClass and audited. Reads live in ./queries. */

/**
 * Explicit canManageClass gate - the route this replaces relied on RLS alone
 * for insert authorization; every other write path in the app double-checks
 * app-side too, so this closes that inconsistency (a hardening change, not
 * just a mechanical move).
 */
export async function createAssignment(actor: Profile, input: CreateAssignmentInput): Promise<Assignment> {
  if (!(await canManageClass(actor, input.class_id))) {
    throw new PermissionError('Not allowed to create an assignment for this class.')
  }
  const created = await insertAssignment({
    class_id: input.class_id,
    title: input.title,
    description: input.description,
    due_date: input.due_date,
    attachment_drive_link: input.attachment_drive_link ?? null,
    topic: input.topic ?? null,
    max_marks: input.max_marks ?? null,
    status: 'active',
    created_by: actor.id,
  })
  await auditPrivilegedAction(actor, 'assignment.create', 'assignment', created.id)
  return created
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
  const existing = await requireManageable(actor, id)
  await updateAssignment(id, patch)
  // A moved deadline invalidates every stamped on-time/late verdict on this
  // assignment - see ./reclassify.
  if (patch.due_date !== undefined && patch.due_date !== existing.due_date) {
    await reclassifySubmissions(id, patch.due_date)
  }
  await auditPrivilegedAction(actor, 'assignment.edit', 'assignment', id)
}

export async function editAssignmentFromActionInput(actor: Profile, input: EditAssignmentActionInput): Promise<void> {
  const parsed = validateEditAssignmentInput(input)
  await editAssignment(actor, parsed.id, parsed.patch)
}
