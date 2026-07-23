import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { getProfileById } from '@/lib/services/users'
import { requireActorCapability } from '@/lib/services/authorization'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { ValidationError } from '@/lib/errors'
import {
  deactivateMentorship,
  selectMentorshipParties,
  upsertMentorship,
} from '@/lib/data/mentorships'
import { deleteScopedMentorPersona, upsertScopedMentorPersona } from '@/lib/data/personas'
import {
  validateAssignMentorInput,
  validateRemoveMentorInput,
  type AssignMentorActionInput,
  type MentorshipParams,
  type RemoveMentorActionInput,
} from './validation'

/**
 * Creating and ending mentorships.
 *
 * Both paths need `manageMentorships` rather than general user management,
 * because assigning a mentor grants a scoped mentor persona over a student's
 * data. It is admin by default and override-grantable.
 *
 * A mentorship is TWO rows: the link itself, and the student-scoped mentor
 * persona that actually grants access. Keeping them consistent is the whole
 * job of this module - see the ordering note in removeMentor.
 */

/**
 * Verify a would-be mentor is assignable - exists, is a mentor (or a tutor who
 * also mentors), and is active - WITHOUT performing the assignment. Lets a caller
 * fail fast before creating a dependent record (e.g. a new student account) that
 * a later failed assign would orphan, and rejects a stale/revoked mentor picked
 * from a dropdown that went out of date between page-load and submit.
 */
export async function assertAssignableMentor(mentorId: string): Promise<void> {
  const mentor = await getProfileById(mentorId)
  if (!mentor || (mentor.role !== 'mentor' && mentor.role !== 'tutor')) {
    throw new ValidationError('mentor_id must be a mentor or tutor')
  }
  if (mentor.status !== 'active') {
    throw new ValidationError('That mentor is no longer active - choose another.')
  }
}

/**
 * Mentor assignment is managed by admin/sub_admin from the Users hub - not
 * gated by canManageClass (mentorship is pastoral, independent of which
 * class/subject anyone teaches). The UI only offers valid options, but a
 * crafted POST could pair arbitrary ids - verify the mentor really is an active
 * mentor (or a tutor who also mentors) and the mentee really is a student.
 */
export async function assignMentor(actor: Profile, params: MentorshipParams): Promise<void> {
  await requireActorCapability(actor.id, 'manageMentorships', 'You are not allowed to manage mentors.')
  await assertAssignableMentor(params.mentorId)
  const student = await getProfileById(params.studentId)
  if (!student || student.role !== 'student') throw new ValidationError('student_id must be a student')

  await upsertMentorship(params.mentorId, params.studentId)
  // The scoped persona is what lets the mentor reach this student's data outside
  // any class context; the link row alone grants nothing.
  await upsertScopedMentorPersona(params.mentorId, params.studentId)
  await auditPrivilegedAction(actor, 'mentorship.assign', 'mentorship', params.studentId)
}

export async function assignMentorFromActionInput(actor: Profile, input: AssignMentorActionInput): Promise<void> {
  await assignMentor(actor, validateAssignMentorInput(input))
}

/** Soft-remove a mentorship link by id (keeps the record). */
export async function removeMentor(actor: Profile, id: string): Promise<void> {
  await requireActorCapability(actor.id, 'manageMentorships', 'You are not allowed to manage mentors.')
  const parties = await selectMentorshipParties(id)

  // These two writes aren't in one transaction, so order matters for safety.
  // Delete the ACCESS-GRANTING scoped persona FIRST: canMentor and every
  // mentee-data path key off that row, not mentorships.active. If the second
  // write then fails, the worst case is a mentor with LESS access than the list
  // shows (fail-closed) - never a "removed" mentor who still has access. The
  // delete is idempotent, so an admin's retry reconciles cleanly.
  if (parties) {
    await deleteScopedMentorPersona(parties.mentor_id, parties.student_id)
  }
  await deactivateMentorship(id)

  await auditPrivilegedAction(actor, 'mentorship.remove', 'mentorship', id)
}

export async function removeMentorFromActionInput(actor: Profile, input: RemoveMentorActionInput): Promise<void> {
  await removeMentor(actor, validateRemoveMentorInput(input))
}
