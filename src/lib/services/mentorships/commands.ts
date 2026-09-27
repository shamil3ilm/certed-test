import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { getProfileById } from '@/lib/services/users'
import { requireActorCapability } from '@/lib/services/authorization'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { callAssignMentorship, callRemoveMentorship, selectMentorshipParties } from '@/lib/data/mentorships'
import { notifyBestEffort } from '@/lib/services/notifications'
import {
  validateAssignMentorInput,
  validateRemoveMentorInput,
  validateReplaceMentorInput,
  type AssignMentorActionInput,
  type MentorshipParams,
  type RemoveMentorActionInput,
  type ReplaceMentorActionInput,
  type ReplaceMentorParams,
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
  // From the invitation onwards: a student is created WITH their mentor, and an invited account
  // is pending until they register. Never over a revoked student, whose mentor would otherwise
  // hold the scoped persona that grants access to their data.
  if (!student || student.role !== 'student' || student.status === 'disabled')
    throw new ValidationError('student_id must be a student who has not been revoked')

  // Eligibility is re-checked inside the write: a revoke landing after the checks above
  // must not end with a mentor holding reach over the student.
  const result = await callAssignMentorship(params.mentorId, params.studentId)
  if (!result.ok) {
    throw new ValidationError(
      result.reason === 'mentor_not_assignable'
        ? 'That mentor is no longer active - choose another.'
        : 'student_id must be a student who has not been revoked',
    )
  }
  await auditPrivilegedAction(actor, 'mentorship.assign', 'mentorship', params.studentId)
  // Both sides of a new pastoral link hear about it: the mentor gains someone to look after,
  // the student gains someone to turn to. Neither was told before.
  await notifyBestEffort([params.mentorId], {
    kind: 'mentorship',
    title: 'You were assigned a new mentee',
    body: student.full_name ?? student.email,
    link: `/students/${params.studentId}`,
  })
  await notifyBestEffort([params.studentId], {
    kind: 'mentorship',
    title: 'You were assigned a mentor',
    link: '/dashboard',
  })
}

export async function assignMentorFromActionInput(actor: Profile, input: AssignMentorActionInput): Promise<void> {
  await assignMentor(actor, validateAssignMentorInput(input))
}

/** Soft-remove a mentorship link by id (keeps the record). */
export async function removeMentor(actor: Profile, id: string): Promise<void> {
  await requireActorCapability(actor.id, 'manageMentorships', 'You are not allowed to manage mentors.')
  // Read the pair BEFORE the removal: afterwards the link is inactive, and the two people it
  // joined can no longer be named from it.
  // Only the notification below needs it, so a failure to read it must not fail the removal.
  const parties = await selectMentorshipParties(id).catch(() => null)
  // A bogus/stale id names no mentorship at all - refuse rather than audit a
  // `mentorship.remove` that never happened. A link that exists (even already
  // inactive) is removed again, so an idempotent retry is unaffected.
  const outcome = await callRemoveMentorship(id)
  if (outcome === 'not_found') throw new NotFoundError('Mentorship not found')
  // An active student keeps at least one mentor (0120): say which way out there is, rather
  // than reporting a refusal the reader cannot act on.
  if (outcome === 'last_mentor') {
    throw new ValidationError(
      "That is this student's only mentor. Use Change mentor to swap, or add another mentor first.",
    )
  }

  await auditPrivilegedAction(actor, 'mentorship.remove', 'mentorship', id)
  if (parties) {
    await notifyBestEffort([parties.mentor_id, parties.student_id], {
      kind: 'mentorship',
      title: 'A mentor assignment ended',
      body: 'Contact the academy if you were expecting this to continue.',
    })
  }
}

export async function removeMentorFromActionInput(actor: Profile, input: RemoveMentorActionInput): Promise<void> {
  await removeMentor(actor, validateRemoveMentorInput(input))
}

/**
 * Swap one of a student's mentors for another: assign the replacement FIRST, then remove the
 * old link. In that order the student never has zero mentors, so the last-mentor guard (0120)
 * never blocks a swap - and a failed assign leaves the existing mentor in place rather than
 * stranding the student.
 */
export async function replaceMentor(actor: Profile, params: ReplaceMentorParams): Promise<void> {
  await assignMentor(actor, { mentorId: params.mentorId, studentId: params.studentId })
  await removeMentor(actor, params.linkId)
}

export async function replaceMentorFromActionInput(actor: Profile, input: ReplaceMentorActionInput): Promise<void> {
  await replaceMentor(actor, validateReplaceMentorInput(input))
}
