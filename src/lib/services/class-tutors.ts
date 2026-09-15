import type { Profile } from '@/lib/auth/profile'
import {
  callAssignClassTutor,
  callUnassignClassTutor,
  selectActiveTeachingProfileIds,
} from '@/lib/data/class-membership'
import { selectClassStatus } from '@/lib/data/classes'
import { selectActiveProfileIdsByPersona } from '@/lib/data/personas'
import { requireActorCapability } from '@/lib/services/authorization'
import { getProfileById } from '@/lib/services/users'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { z } from 'zod'

type ClassTutorParams = { classId: string; tutorId: string }
type ClassTutorActionInput = { class_id?: FormDataEntryValue | null; tutor_id?: FormDataEntryValue | null }

/** Of the given profile ids, the subset who actively teach at least one class -
 *  the "teaches" flag behind staff role labels. The single service entry point so
 *  callers (dashboard tiles, the Users hub) don't reach into the data layer. */
export async function activeTeachingProfileIds(profileIds: string[]): Promise<string[]> {
  return selectActiveTeachingProfileIds(profileIds)
}

/** Of the given profile ids, the subset holding an active mentor persona - the
 *  "mentors" flag behind staff role labels, so a tutor who also mentors reads as
 *  "Tutor & Mentor" (matching personaLabel) rather than a plain "Tutor". */
export async function activeMentorProfileIds(profileIds: string[]): Promise<string[]> {
  if (profileIds.length === 0) return []
  const wanted = new Set(profileIds)
  return (await selectActiveProfileIdsByPersona('mentor')).filter((id) => wanted.has(id))
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
 * Requires manageClasses - changing a class's teaching staff is a whole-class
 * management action (see classes.ts). The UI only offers valid options, but a crafted
 * POST could pair an arbitrary profile id - verify it's really an active
 * tutor-capable teacher before granting class_tutors membership (which itself
 * grants full tutor-level RLS access to the class).
 */
export async function addTutor(actor: Profile, params: ClassTutorParams): Promise<void> {
  await requireActorCapability(actor.id, 'manageClasses', 'You are not allowed to manage classes.')
  const tutor = await getProfileById(params.tutorId)
  if (!tutor || (tutor.role !== 'tutor' && tutor.role !== 'mentor') || tutor.status !== 'active') {
    throw new ValidationError('tutor_id must be an active tutor or mentor')
  }
  // Don't assign teaching staff to an archived class (soft-deleted state).
  if ((await selectClassStatus(params.classId)) !== 'active') {
    throw new ValidationError('That class is archived - restore it before assigning tutors.')
  }
  // The membership and - for a dedicated mentor who also teaches - the global tutor persona
  // the teaching workflows need are one transaction (0109). It re-checks both parties, and
  // shares a lock with removal, so an assign and a remove for the same person take turns and
  // neither row can exist without the other.
  const result = await callAssignClassTutor(params.classId, params.tutorId)
  if (!result.ok) {
    throw new ValidationError(
      result.reason === 'class_not_active'
        ? 'That class is archived - restore it before assigning tutors.'
        : 'tutor_id must be an active tutor or mentor',
    )
  }
  await auditPrivilegedAction(actor, 'class.assign_tutor', 'class_tutor', params.classId)
}

export async function addTutorFromActionInput(actor: Profile, input: ClassTutorActionInput): Promise<void> {
  await addTutor(actor, validateClassTutorParams(input))
}

/** Soft-remove (scoped by class + tutor) - keeps the row for later re-assign. */
export async function removeTutor(actor: Profile, params: ClassTutorParams): Promise<void> {
  await requireActorCapability(actor.id, 'manageClasses', 'You are not allowed to manage classes.')
  // Deactivates the membership and, for a dedicated mentor now teaching nothing, the tutor
  // persona teaching gave them - one transaction under the lock assignment takes, so a
  // concurrent assignment cannot land between counting the remaining classes and removing
  // the persona. A true tutor keeps their tutor persona: it is their identity, not a grant.
  if (!(await callUnassignClassTutor(params.classId, params.tutorId))) {
    throw new NotFoundError('That tutor is not assigned to this class.')
  }
  await auditPrivilegedAction(actor, 'class.unassign_tutor', 'class_tutor', params.classId)
}

export async function removeTutorFromActionInput(actor: Profile, input: ClassTutorActionInput): Promise<void> {
  await removeTutor(actor, validateClassTutorParams(input))
}
