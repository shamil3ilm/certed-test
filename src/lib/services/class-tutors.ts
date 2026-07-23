import type { Profile } from '@/lib/auth/profile'
import {
  deactivateClassTutor,
  selectActiveClassTutors,
  upsertClassTutor,
  type ClassTutorRecord,
} from '@/lib/data/class-membership'
import { selectClassStatus } from '@/lib/data/classes'
import { requireAdminPersona } from '@/lib/permission/personas'
import { getProfileById } from '@/lib/services/users'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { ValidationError } from '@/lib/errors'
import { z } from 'zod'

export type ClassTutor = ClassTutorRecord

export async function listClassTutors(classId?: string): Promise<ClassTutor[]> {
  return selectActiveClassTutors(classId)
}

// Use requireAdminPersona from personas.ts instead of local implementation

export type ClassTutorParams = { classId: string; tutorId: string }
export type ClassTutorActionInput = { class_id?: FormDataEntryValue | null; tutor_id?: FormDataEntryValue | null }

const classTutorParamsSchema = z.object({
  classId: z.string().uuid(),
  tutorId: z.string().uuid(),
})

export function validateClassTutorParams(input: ClassTutorActionInput): ClassTutorParams {
  const parsed = classTutorParamsSchema.safeParse({
    classId: String(input.class_id ?? ''),
    tutorId: String(input.tutor_id ?? ''),
  })
  if (!parsed.success) {
    throw new ValidationError('Invalid class-tutor assignment data')
  }
  return parsed.data
}

/**
 * Admin-only - changing a class's teaching staff is a whole-class management
 * action (see classes.ts). The UI only offers valid options, but a crafted
 * POST could pair an arbitrary profile id - verify it's really an active
 * tutor before granting class_tutors membership (which itself grants
 * full tutor-level RLS access to the class).
 */
export async function addTutor(actor: Profile, params: ClassTutorParams): Promise<void> {
  await requireAdminPersona(actor)
  const tutor = await getProfileById(params.tutorId)
  if (!tutor || tutor.role !== 'tutor' || tutor.status !== 'active') {
    throw new ValidationError('tutor_id must be an active tutor')
  }
  // Don't assign teaching staff to an archived class (soft-deleted state).
  if ((await selectClassStatus(params.classId)) !== 'active') {
    throw new ValidationError('That class is archived - restore it before assigning tutors.')
  }
  await upsertClassTutor(params.tutorId, params.classId)
  await auditPrivilegedAction(actor, 'class.assign_tutor', 'class_tutor', params.classId)
}

export async function addTutorFromActionInput(actor: Profile, input: ClassTutorActionInput): Promise<void> {
  await addTutor(actor, validateClassTutorParams(input))
}

/** Soft-remove (scoped by class + tutor) - keeps the row for later re-assign. */
export async function removeTutor(actor: Profile, params: ClassTutorParams): Promise<void> {
  await requireAdminPersona(actor)
  await deactivateClassTutor(params.classId, params.tutorId)
  await auditPrivilegedAction(actor, 'class.unassign_tutor', 'class_tutor', params.classId)
}

export async function removeTutorFromActionInput(actor: Profile, input: ClassTutorActionInput): Promise<void> {
  await removeTutor(actor, validateClassTutorParams(input))
}
