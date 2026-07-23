import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { getAssignment } from '@/lib/services/assignments'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { notifyBestEffort } from '@/lib/services/notifications'
import { updateGrade } from '@/lib/data/submissions'
import { gradeSchema } from '@/lib/validation/assignment'
import { z } from 'zod'
import { getSubmission } from './queries'

/** A TUTOR marking a submission: authorization against the submission's own
 *  class, the resubmit race guard, the max-marks rule, audit and the notification. */

export type GradeSubmissionInput = {
  submissionId: string
  score: number | null
  feedback: string | null
}

const submissionIdSchema = z.string().uuid()

export type GradeSubmissionActionInput = {
  submission_id?: FormDataEntryValue | null
  score?: FormDataEntryValue | null
  feedback?: FormDataEntryValue | null
}

export function validateGradeSubmissionInput(input: GradeSubmissionActionInput): GradeSubmissionInput {
  const submissionId = submissionIdSchema.safeParse(String(input.submission_id ?? '').trim())
  if (!submissionId.success) {
    throw new ValidationError('Missing submission.')
  }
  const scoreRaw = String(input.score ?? '').trim()
  const feedbackRaw = String(input.feedback ?? '').trim()
  const parsed = gradeSchema.safeParse({
    score: scoreRaw === '' ? null : Number(scoreRaw),
    feedback: feedbackRaw || undefined,
  })
  if (!parsed.success) {
    throw new ValidationError('Enter a valid mark (0-9999.99).')
  }
  return {
    submissionId: submissionId.data,
    score: parsed.data.score,
    feedback: parsed.data.feedback ?? null,
  }
}

/**
 * Records a tutor's mark + feedback on a submission. Runs via the service
 * role because tutor-grading isn't in the submissions RLS (which only lets
 * an admin or the student themselves write). Authorizes against the
 * submission's OWN assignment/class - NEVER a client-supplied assignment id,
 * which could name a class the caller manages while the write targets a
 * submission in a class they don't. A null score clears a previously-entered
 * mark.
 */
export async function gradeSubmission(actor: Profile, input: GradeSubmissionInput): Promise<{ assignmentId: string }> {
  const submission = await getSubmission(input.submissionId)
  if (!submission) throw new NotFoundError('Not allowed to grade this submission.')
  // Guard the resubmit race: if the student replaced this submission after the
  // tutor opened the grading UI, this row is now inactive and the report card
  // reads only the active one - so a mark saved here would silently vanish.
  if (!submission.is_active) {
    throw new ValidationError('This submission was replaced by a newer one - reload to grade the latest.')
  }
  const assignment = await getAssignment(submission.assignment_id)
  if (!assignment || !(await canManageClass(actor, assignment.class_id))) {
    throw new PermissionError('Not allowed to grade this submission.')
  }
  if (input.score != null && assignment.max_marks != null && input.score > Number(assignment.max_marks)) {
    throw new ValidationError(`Mark can't exceed the maximum (${Number(assignment.max_marks)}).`)
  }

  // Clearing a mark (null score) also clears graded_at/graded_by, so a row never
  // sits in a "graded_at set but no score" half-state.
  const cleared = input.score == null
  await updateGrade(input.submissionId, {
    score: input.score,
    feedback: input.feedback,
    graded_at: cleared ? null : new Date().toISOString(),
    graded_by: cleared ? null : actor.id,
  })
  await auditPrivilegedAction(actor, 'submission.grade', 'submission', input.submissionId)
  // Best-effort: tell the student their work was graded (not when a mark is cleared).
  if (!cleared) {
    await notifyBestEffort([submission.student_id], {
      kind: 'grade',
      title: 'Your work was graded',
      body: assignment.title,
      link: `/classroom/${assignment.class_id}/classwork`,
    })
  }
  return { assignmentId: submission.assignment_id }
}

export async function gradeSubmissionFromActionInput(
  actor: Profile,
  input: GradeSubmissionActionInput,
): Promise<{ assignmentId: string }> {
  return gradeSubmission(actor, validateGradeSubmissionInput(input))
}
