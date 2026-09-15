import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { getProfileById } from '@/lib/services/users'
import { requireActorCapability } from '@/lib/services/authorization'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { callAssignMentorship, callRemoveMentorship } from '@/lib/data/mentorships'
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
 * persona that actually grants access. The database writes both in one transaction,
 * under a lock that makes an assign and a remove of the same pair take turns (0108),
 * so neither row ever exists without the other.
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
  // Active-only, matching enrolStudent - don't create a mentorship (and the scoped
  // persona that grants data access) over a disabled/revoked student.
  if (!student || student.role !== 'student' || student.status !== 'active')
    throw new ValidationError('student_id must be an active student')

  // Eligibility is re-checked inside the write: a revoke landing after the checks above
  // must not end with a mentor holding reach over the student.
  const result = await callAssignMentorship(params.mentorId, params.studentId)
  if (!result.ok) {
    throw new ValidationError(
      result.reason === 'mentor_not_assignable'
        ? 'That mentor is no longer active - choose another.'
        : 'student_id must be an active student',
    )
  }
  await auditPrivilegedAction(actor, 'mentorship.assign', 'mentorship', params.studentId)
}

export async function assignMentorFromActionInput(actor: Profile, input: AssignMentorActionInput): Promise<void> {
  await assignMentor(actor, validateAssignMentorInput(input))
}

/** Soft-remove a mentorship link by id (keeps the record). */
export async function removeMentor(actor: Profile, id: string): Promise<void> {
  await requireActorCapability(actor.id, 'manageMentorships', 'You are not allowed to manage mentors.')
  // A bogus/stale id names no mentorship at all - refuse rather than audit a
  // `mentorship.remove` that never happened. A link that exists (even already
  // inactive) is removed again, so an idempotent retry is unaffected.
  if (!(await callRemoveMentorship(id))) throw new NotFoundError('Mentorship not found')

  await auditPrivilegedAction(actor, 'mentorship.remove', 'mentorship', id)
}

export async function removeMentorFromActionInput(actor: Profile, input: RemoveMentorActionInput): Promise<void> {
  await removeMentor(actor, validateRemoveMentorInput(input))
}
