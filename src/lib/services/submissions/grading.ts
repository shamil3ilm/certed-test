import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canWriteClass } from '@/lib/permission/class-write'
import { getAssignment } from '@/lib/services/assignments'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { notifyBestEffort } from '@/lib/services/notifications'
import { updateGrade, selectActiveSubmissionIdForStudent, insertResultGrade } from '@/lib/data/submissions'
import { selectActiveStudentIdsByClassIds } from '@/lib/data/class-membership'
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
  // canWriteClass, not canManageClass: the latter admits a MENTOR (pastoral oversight),
  // but this is a staff WRITE and the table's RLS excludes mentors for this verb. The
  // write goes through the service-role client, so RLS never runs and this gate is the
  // only control - a mismatch here is the whole exposure, not a second line of defence (C-08).
  if (!assignment || !(await canWriteClass(actor, assignment.class_id))) {
    throw new PermissionError('Not allowed to grade this submission.')
  }
  if (input.score != null && assignment.max_marks != null && input.score > Number(assignment.max_marks)) {
    throw new ValidationError(`Mark can't exceed the maximum (${Number(assignment.max_marks)}).`)
  }

  // Clearing a mark (null score) also clears feedback AND graded_at/graded_by, so
  // a row never sits in a half-graded state - no orphaned feedback, and no
  // "graded_at set but no score". Otherwise a crafted request could send an empty
  // score with feedback text and leave feedback attached to an ungraded row.
  const cleared = input.score == null
  const graded = await updateGrade(input.submissionId, {
    score: input.score,
    feedback: cleared ? null : input.feedback,
    graded_at: cleared ? null : new Date().toISOString(),
    graded_by: cleared ? null : actor.id,
  })
  // The row was active at the read above but the conditional write matched
  // nothing, so a withdraw/resubmit landed in between - the same "replaced"
  // outcome the pre-check guards, now caught atomically at write time.
  if (!graded) {
    throw new ValidationError('This submission was replaced by a newer one - reload to grade the latest.')
  }
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

/** A TUTOR recording a mark for IN-PERSON work (an exam/quiz/test with no online
 *  submission). Keyed on (assignment, student) rather than a submission id: there
 *  may be no submission to reference, so the mark lands on the student's active
 *  submission if one exists, else on a fresh graded result row - which then feeds
 *  the report card exactly like a graded upload. A null score clears the mark. */
export type GradeStudentResultInput = {
  assignmentId: string
  studentId: string
  score: number | null
  feedback: string | null
}

export type GradeStudentResultActionInput = {
  assignment_id?: FormDataEntryValue | null
  student_id?: FormDataEntryValue | null
  score?: FormDataEntryValue | null
  feedback?: FormDataEntryValue | null
}

export function validateGradeStudentResultInput(input: GradeStudentResultActionInput): GradeStudentResultInput {
  const assignmentId = submissionIdSchema.safeParse(String(input.assignment_id ?? '').trim())
  const studentId = submissionIdSchema.safeParse(String(input.student_id ?? '').trim())
  if (!assignmentId.success || !studentId.success) {
    throw new ValidationError('Missing assignment or student.')
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
    assignmentId: assignmentId.data,
    studentId: studentId.data,
    score: parsed.data.score,
    feedback: parsed.data.feedback ?? null,
  }
}

export async function gradeStudentResult(
  actor: Profile,
  input: GradeStudentResultInput,
): Promise<{ assignmentId: string }> {
  const assignment = await getAssignment(input.assignmentId)
  // canWriteClass, not canManageClass: the latter admits a MENTOR (pastoral oversight),
  // but this is a staff WRITE and the table's RLS excludes mentors for this verb. The
  // write goes through the service-role client, so RLS never runs and this gate is the
  // only control - a mismatch here is the whole exposure, not a second line of defence (C-08).
  if (!assignment || !(await canWriteClass(actor, assignment.class_id))) {
    throw new PermissionError('Not allowed to grade this.')
  }
  // Only an actively-enrolled student of THIS class may be marked - never an
  // arbitrary profile id a crafted request supplied.
  const enrolled = await selectActiveStudentIdsByClassIds([assignment.class_id])
  if (!enrolled.includes(input.studentId)) {
    throw new ValidationError('That student is not enrolled in this class.')
  }
  if (input.score != null && assignment.max_marks != null && input.score > Number(assignment.max_marks)) {
    throw new ValidationError(`Mark can't exceed the maximum (${Number(assignment.max_marks)}).`)
  }

  const cleared = input.score == null
  const patch = {
    score: input.score,
    feedback: cleared ? null : input.feedback,
    graded_at: cleared ? null : new Date().toISOString(),
    graded_by: cleared ? null : actor.id,
  }
  const existingId = await selectActiveSubmissionIdForStudent(input.assignmentId, input.studentId)
  if (existingId) {
    await updateGrade(existingId, patch)
  } else if (!cleared) {
    // No submission yet - create the graded result row. (Clearing a non-existent
    // mark is a no-op.)
    await insertResultGrade(input.assignmentId, input.studentId, {
      score: input.score as number,
      feedback: input.feedback,
      graded_at: patch.graded_at as string,
      graded_by: actor.id,
    })
  }
  await auditPrivilegedAction(actor, 'submission.grade', 'submission', existingId ?? input.assignmentId)
  if (!cleared) {
    await notifyBestEffort([input.studentId], {
      kind: 'grade',
      title: 'Your work was graded',
      body: assignment.title,
      link: `/classroom/${assignment.class_id}/classwork`,
    })
  }
  return { assignmentId: input.assignmentId }
}

export async function gradeStudentResultFromActionInput(
  actor: Profile,
  input: GradeStudentResultActionInput,
): Promise<{ assignmentId: string }> {
  return gradeStudentResult(actor, validateGradeStudentResultInput(input))
}
