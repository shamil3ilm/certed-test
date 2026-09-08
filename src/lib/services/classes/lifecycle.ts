import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { requireActorCapability } from '@/lib/services/authorization'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { insertClass, updateClassName, updateClassStatus, type ClassRow } from '@/lib/data/classes'
import {
  validateClassIdInput,
  validateRenameClassInput,
  type ClassIdActionInput,
  type RenameClassActionInput,
} from './validation'

/**
 * Whole-class management (create, rename, archive/restore) requires the
 * manageClasses capability (admin and sub_admin hold it by default) - a single
 * tutor shouldn't be able to rename/hide a shared class. Day-to-day student
 * enrolment lives in enrollments.ts.
 *
 * Every function here follows the same shape: require the capability, write, then
 * audit. Reads live in ./queries.
 */

/**
 * A class IS a student's subject - it is created from the student's page by "Add subject",
 * and every list, receipt line and hours report reads it that way. So `subjectId` is
 * REQUIRED rather than defaulted to null: a class without one is a class nothing can label,
 * which is how "C12" came to print as the subject on a fee document.
 *
 * The action-input wrapper that created classes with no subject went with this change - it
 * had no caller, and it was the only way to make one.
 */
export async function createClass(actor: Profile, name: string, subjectId: string): Promise<ClassRow> {
  await requireActorCapability(actor.id, 'manageClasses', 'You are not allowed to manage classes.')
  const created = await insertClass(name, subjectId)
  await auditPrivilegedAction(actor, 'class.create', 'class', created.id)
  return created
}

export async function renameClass(actor: Profile, id: string, name: string): Promise<void> {
  await requireActorCapability(actor.id, 'manageClasses', 'You are not allowed to manage classes.')
  await updateClassName(id, name)
  await auditPrivilegedAction(actor, 'class.rename', 'class', id)
}

export async function renameClassFromActionInput(actor: Profile, input: RenameClassActionInput): Promise<void> {
  const parsed = validateRenameClassInput(input)
  await renameClass(actor, parsed.id, parsed.name)
}

export async function archiveClass(actor: Profile, id: string): Promise<void> {
  await requireActorCapability(actor.id, 'manageClasses', 'You are not allowed to manage classes.')
  await updateClassStatus(id, 'archived')
  await auditPrivilegedAction(actor, 'class.archive', 'class', id)
}

export async function archiveClassFromActionInput(actor: Profile, input: ClassIdActionInput): Promise<void> {
  await archiveClass(actor, validateClassIdInput(input))
}

export async function restoreClass(actor: Profile, id: string): Promise<void> {
  await requireActorCapability(actor.id, 'manageClasses', 'You are not allowed to manage classes.')
  await updateClassStatus(id, 'active')
  await auditPrivilegedAction(actor, 'class.restore', 'class', id)
}

export async function restoreClassFromActionInput(actor: Profile, input: ClassIdActionInput): Promise<void> {
  await restoreClass(actor, validateClassIdInput(input))
}
