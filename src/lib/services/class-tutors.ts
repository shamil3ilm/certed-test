import type { Profile } from '@/lib/auth/profile'
import {
  deactivateClassTutor,
  selectActiveClassIdsForTutor,
  selectActiveTeachingProfileIds,
  upsertClassTutor,
} from '@/lib/data/class-membership'
import { selectClassStatus } from '@/lib/data/classes'
import { deactivateGlobalPersona, upsertGlobalPersona } from '@/lib/data/personas'
import { requireAdminPersona } from '@/lib/permission/personas'
import { getProfileById } from '@/lib/services/users'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { ValidationError } from '@/lib/errors'
import { z } from 'zod'

type ClassTutorParams = { classId: string; tutorId: string }
type ClassTutorActionInput = { class_id?: FormDataEntryValue | null; tutor_id?: FormDataEntryValue | null }

/** Of the given profile ids, the subset who actively teach at least one class -
 *  the "teaches" flag behind staff role labels. The single service entry point so
 *  callers (dashboard tiles, the Users hub) don't reach into the data layer. */
export async function activeTeachingProfileIds(profileIds: string[]): Promise<string[]> {
  return selectActiveTeachingProfileIds(profileIds)
}

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
 * tutor-capable teacher before granting class_tutors membership (which itself
 * grants full tutor-level RLS access to the class).
 */
export async function addTutor(actor: Profile, params: ClassTutorParams): Promise<void> {
  await requireAdminPersona(actor)
  const tutor = await getProfileById(params.tutorId)
  if (!tutor || (tutor.role !== 'tutor' && tutor.role !== 'mentor') || tutor.status !== 'active') {
    throw new ValidationError('tutor_id must be an active tutor or mentor')
  }
  // Don't assign teaching staff to an archived class (soft-deleted state).
  if ((await selectClassStatus(params.classId)) !== 'active') {
    throw new ValidationError('That class is archived - restore it before assigning tutors.')
  }
  // A dedicated mentor may also teach. Grant the global tutor persona the first
  // time such an account is assigned to a class so the capability model, nav,
  // and class/timetable workflows stay in step with the teaching membership.
  if (tutor.role === 'mentor') {
    await upsertGlobalPersona(tutor.id, 'tutor')
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
  // If this was a dedicated mentor account that no longer teaches any class,
  // remove the extra tutor persona we granted when teaching began. A true tutor
  // identity keeps its tutor persona even with zero current assignments.
  const target = await getProfileById(params.tutorId)
  if (target?.role === 'mentor' && target.status === 'active') {
    const remainingClassIds = await selectActiveClassIdsForTutor(params.tutorId)
    if (remainingClassIds.length === 0) {
      await deactivateGlobalPersona(params.tutorId, 'tutor')
    }
  }
  await auditPrivilegedAction(actor, 'class.unassign_tutor', 'class_tutor', params.classId)
}

export async function removeTutorFromActionInput(actor: Profile, input: ClassTutorActionInput): Promise<void> {
  await removeTutor(actor, validateClassTutorParams(input))
}
