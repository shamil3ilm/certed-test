import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { requireAdminPersona } from '@/lib/permission/personas'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { insertClass, updateClassName, updateClassStatus, type ClassRow } from '@/lib/data/classes'
import {
  validateClassIdInput,
  validateCreateClassInput,
  validateRenameClassInput,
  type ClassIdActionInput,
  type CreateClassActionInput,
  type RenameClassActionInput,
} from './validation'

/**
 * Whole-class management (create, rename, archive/restore) is ADMIN-ONLY - a
 * single tutor shouldn't be able to rename/hide a shared class or change its
 * teaching staff. Day-to-day student enrolment lives in enrollments.ts.
 *
 * Every function here follows the same shape: assert the admin persona, write,
 * then audit. Reads live in ./queries.
 */

export async function createClass(actor: Profile, name: string): Promise<ClassRow> {
  await requireAdminPersona(actor)
  const created = await insertClass(name)
  await auditPrivilegedAction(actor, 'class.create', 'class', created.id)
  return created
}

export async function createClassFromActionInput(actor: Profile, input: CreateClassActionInput): Promise<ClassRow> {
  const parsed = validateCreateClassInput(input)
  return createClass(actor, parsed.name)
}

export async function renameClass(actor: Profile, id: string, name: string): Promise<void> {
  await requireAdminPersona(actor)
  await updateClassName(id, name)
  await auditPrivilegedAction(actor, 'class.rename', 'class', id)
}

export async function renameClassFromActionInput(actor: Profile, input: RenameClassActionInput): Promise<void> {
  const parsed = validateRenameClassInput(input)
  await renameClass(actor, parsed.id, parsed.name)
}

export async function archiveClass(actor: Profile, id: string): Promise<void> {
  await requireAdminPersona(actor)
  await updateClassStatus(id, 'archived')
  await auditPrivilegedAction(actor, 'class.archive', 'class', id)
}

export async function archiveClassFromActionInput(actor: Profile, input: ClassIdActionInput): Promise<void> {
  await archiveClass(actor, validateClassIdInput(input))
}

export async function restoreClass(actor: Profile, id: string): Promise<void> {
  await requireAdminPersona(actor)
  await updateClassStatus(id, 'active')
  await auditPrivilegedAction(actor, 'class.restore', 'class', id)
}

export async function restoreClassFromActionInput(actor: Profile, input: ClassIdActionInput): Promise<void> {
  await restoreClass(actor, validateClassIdInput(input))
}
