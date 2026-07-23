import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { getAssignment } from '@/lib/services/assignments'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { submissionInputSchema } from '@/lib/assignments/submit-schema'
import { callReplaceOwnSubmission, markInactiveForStudent } from '@/lib/data/submissions'
import { z } from 'zod'
import { getSubmission, type Submission } from './queries'

/** What a STUDENT does with their own work: submit/resubmit, and withdraw while
 *  it is still ungraded. Tutor marking lives in ./grading. */

const submissionIdSchema = z.string().uuid()

export type RecordSubmissionInput = {
  assignment_id: string
  drive_link: string | null
  file_name?: string | null
}

export type RecordSubmissionActionInput = {
  assignment_id?: FormDataEntryValue | null
  url?: FormDataEntryValue | null
  file_name?: FormDataEntryValue | null
}

export function validateRecordSubmissionInput(input: RecordSubmissionActionInput): RecordSubmissionInput {
  const parsed = submissionInputSchema.safeParse({
    assignment_id: String(input.assignment_id ?? ''),
    url: String(input.url ?? ''),
    file_name: input.file_name ? String(input.file_name) : undefined,
  })
  if (!parsed.success) {
    throw new ValidationError('Please paste a valid link')
  }
  return {
    assignment_id: parsed.data.assignment_id,
    drive_link: parsed.data.url,
    file_name: parsed.data.file_name ?? null,
  }
}

function mapReplaceSubmissionError(message: string): Error {
  switch (message) {
    case 'submission_already_graded':
      return new ValidationError('This work has been graded - ask your tutor to reopen it before resubmitting.')
    case 'assignment_not_found':
      return new NotFoundError('Assignment not found')
    case 'not_enrolled':
    case 'actor_not_active':
      return new PermissionError('Not allowed to submit this assignment.')
    default:
      return new Error(`submissions.record: ${message}`)
  }
}

/**
 * Records a submission, superseding any prior active one (kept as history).
 * RLS (enrolled + own) is the enforcement here, not canManageClass - this is
 * a student submitting their own work, unchanged from the original client.
 */
export async function recordSubmission(actor: Profile, input: RecordSubmissionInput): Promise<Submission> {
  const assignment = await getAssignment(input.assignment_id)
  if (!assignment || assignment.status !== 'active') throw new NotFoundError('Assignment not found')

  const { data, error } = await callReplaceOwnSubmission({
    assignmentId: assignment.id,
    driveLink: input.drive_link,
    fileName: input.file_name ?? null,
  })
  if (error) throw mapReplaceSubmissionError(error.message)
  return data as Submission
}

export async function recordSubmissionFromActionInput(
  actor: Profile,
  input: RecordSubmissionActionInput,
): Promise<Submission> {
  return recordSubmission(actor, validateRecordSubmissionInput(input))
}

export function validateSubmissionIdInput(input: { submission_id?: FormDataEntryValue | null }): string {
  const parsed = submissionIdSchema.safeParse(String(input.submission_id ?? '').trim())
  if (!parsed.success) throw new ValidationError('Missing submission.')
  return parsed.data
}

/**
 * A student withdraws their OWN still-ungraded active submission, retracting it so
 * they can resubmit later (Classroom parity - before grading, work is the student's
 * to pull back). Graded work can't be withdrawn - the tutor reopens it instead. The
 * row is kept as history (is_active=false), like a superseded version; RLS already
 * permits a student to write their own submission (is_self_active(student_id)).
 */
export async function withdrawSubmission(actor: Profile, submissionId: string): Promise<{ assignmentId: string }> {
  const submission = await getSubmission(submissionId)
  if (!submission || submission.student_id !== actor.id) throw new NotFoundError('Submission not found')
  if (!submission.is_active) throw new ValidationError('That submission was already replaced or withdrawn.')
  if (submission.score != null || submission.graded_at != null) {
    throw new ValidationError("Graded work can't be withdrawn - ask your tutor to reopen it.")
  }
  await markInactiveForStudent(submissionId, actor.id)
  return { assignmentId: submission.assignment_id }
}

export async function withdrawSubmissionFromActionInput(
  actor: Profile,
  input: { submission_id?: FormDataEntryValue | null },
): Promise<{ assignmentId: string }> {
  return withdrawSubmission(actor, validateSubmissionIdInput(input))
}
