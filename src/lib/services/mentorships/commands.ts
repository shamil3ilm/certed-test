import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { getProfileById } from '@/lib/services/users'
import { requireActorCapability } from '@/lib/services/authorization'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { NotFoundError, ValidationError } from '@/lib/errors'
import {
  deactivateMentorship,
  deactivateMentorshipByPair,
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
  try {
    // The scoped persona is what lets the mentor reach this student's data
    // outside any class context; the link row alone grants nothing.
    await upsertScopedMentorPersona(params.mentorId, params.studentId)
  } catch (error) {
    // Compensate the now-orphaned link (persona create failed). This runs in its
    // OWN try/catch: if the compensation ALSO fails, the link is left active with
    // no persona - a "ghost" that grants nothing now (canMentor keys off the
    // persona) but that a later account-restore would rebuild into real access,
    // because restorePersonasForProfile trusts mentorships.active. So we must not
    // let the compensation's failure bury the original error - we surface BOTH,
    // distinctly, so the inconsistent pair is visible and reconcilable rather
    // than silently lost.
    try {
      await deactivateMentorshipByPair(params.mentorId, params.studentId)
    } catch (compensationError) {
      const original = error instanceof Error ? error.message : String(error)
      const comp = compensationError instanceof Error ? compensationError.message : String(compensationError)
      throw new Error(
        `mentorship.assign left an orphaned active link for mentor ${params.mentorId} / student ` +
          `${params.studentId}: persona create failed (${original}) AND its compensation failed (${comp}). ` +
          `Deactivate this mentorship manually or re-run the assignment.`,
      )
    }
    throw error
  }
  await auditPrivilegedAction(actor, 'mentorship.assign', 'mentorship', params.studentId)
}

export async function assignMentorFromActionInput(actor: Profile, input: AssignMentorActionInput): Promise<void> {
  await assignMentor(actor, validateAssignMentorInput(input))
}

/** Soft-remove a mentorship link by id (keeps the record). */
export async function removeMentor(actor: Profile, id: string): Promise<void> {
  await requireActorCapability(actor.id, 'manageMentorships', 'You are not allowed to manage mentors.')
  const parties = await selectMentorshipParties(id)
  // A bogus/stale id names no mentorship at all - refuse rather than run the two
  // no-op writes and audit a `mentorship.remove` that never happened. A row that
  // exists (even already-inactive) still resolves parties, so an idempotent
  // re-remove/retry is unaffected.
  if (!parties) throw new NotFoundError('Mentorship not found')

  // These two writes aren't in one transaction, so order matters for safety.
  // Delete the ACCESS-GRANTING scoped persona FIRST: canMentor and every
  // mentee-data path key off that row, not mentorships.active. If the second
  // write then fails, the worst case is a mentor with LESS access than the list
  // shows (fail-closed) - never a "removed" mentor who still has access. The
  // delete is idempotent, so an admin's retry reconciles cleanly.
  await deleteScopedMentorPersona(parties.mentor_id, parties.student_id)
  await deactivateMentorship(id)

  await auditPrivilegedAction(actor, 'mentorship.remove', 'mentorship', id)
}

export async function removeMentorFromActionInput(actor: Profile, input: RemoveMentorActionInput): Promise<void> {
  await removeMentor(actor, validateRemoveMentorInput(input))
}
