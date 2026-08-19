import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { requireActorCapability } from '@/lib/services/authorization'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { parseOrThrow } from '@/lib/validation/parse'
import { createSubjectSchema, subjectIdSchema } from '@/lib/validation/subject'
import {
  insertSubject,
  selectActiveSubjects,
  selectSubjectByName,
  updateSubjectActive,
  type SubjectRow,
} from '@/lib/data/subjects'

/**
 * The academy's subject list. Reads are open to any active user (the pickers);
 * writes are for class/user managers (admin + sub_admin, via manageClasses) - the
 * same tier that does all class/subject assignment.
 */

export type Subject = SubjectRow

export async function listSubjects(): Promise<Subject[]> {
  return selectActiveSubjects()
}

/**
 * Create a subject, or REUSE the existing one with the same (case-insensitive)
 * name. This backs the inline "+ Add" on the assignment picker, so typing "maths"
 * when "Maths" exists returns the existing row rather than forking a duplicate.
 */
export async function createOrReuseSubject(actor: Profile, input: unknown): Promise<Subject> {
  await requireActorCapability(actor.id, 'manageClasses', 'You are not allowed to manage subjects.')
  const { name } = parseOrThrow(createSubjectSchema, input)

  const existing = await selectSubjectByName(name)
  if (existing) return existing
  try {
    const created = await insertSubject(name, actor.id)
    await auditPrivilegedAction(actor, 'subject.create', 'subject', created.id)
    return created
  } catch (error) {
    // Two managers may add the same name at once; the unique(lower(name)) index
    // rejects the loser. Re-read and reuse the winner instead of surfacing a 500.
    const raced = await selectSubjectByName(name)
    if (raced) return raced
    throw error
  }
}

/** Hide a subject from future pickers (existing classes keep their subject). */
export async function deactivateSubject(actor: Profile, input: unknown): Promise<void> {
  await requireActorCapability(actor.id, 'manageClasses', 'You are not allowed to manage subjects.')
  const id = parseOrThrow(subjectIdSchema, input, 'Invalid subject id')
  await updateSubjectActive(id, false)
  await auditPrivilegedAction(actor, 'subject.deactivate', 'subject', id)
}
