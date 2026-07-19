import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { type SubmissionStatus } from '@/lib/assignments/late-status'
import { canManageClass } from '@/lib/permission'
import { getAssignment } from '@/lib/services/assignments'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { submissionInputSchema } from '@/lib/assignments/submit-schema'
import { gradeSchema } from '@/lib/validation/assignment'
import { z } from 'zod'

export type Submission = {
  id: string
  assignment_id: string
  student_id: string
  drive_link: string | null
  file_name: string | null
  status: SubmissionStatus
  score: number | null
  feedback: string | null
  graded_at: string | null
  graded_by: string | null
  submitted_at: string
  is_active: boolean
  created_at: string
}

export async function listSubmissionsForAssignment(assignmentId: string): Promise<Submission[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('is_active', true)
    .order('submitted_at', { ascending: false })
  if (error) throw new Error(`submissions.listForAssignment: ${error.message}`)
  return (data ?? []) as Submission[]
}

/** Superseded (replaced) submissions for an assignment, newest first — the
 *  version history kept when a student resubmits. `is_active=false` rows are
 *  never shown in the normal lists, so without this a replaced file is stored
 *  but recoverable by nobody. RLS scopes reads the same as the active list. */
export async function listSupersededSubmissions(assignmentId: string): Promise<Submission[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('is_active', false)
    .order('submitted_at', { ascending: false })
  if (error) throw new Error(`submissions.listSuperseded: ${error.message}`)
  return (data ?? []) as Submission[]
}

/** Active, not-yet-graded submissions across a set of assignments — the tutor's
 *  "to review" queue. RLS still scopes reads to a tutor of those classes. */
export async function listUngradedSubmissions(assignmentIds: string[]): Promise<Submission[]> {
  if (assignmentIds.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .in('assignment_id', assignmentIds)
    .eq('is_active', true)
    .is('score', null)
    .order('submitted_at', { ascending: true })
  if (error) throw new Error(`submissions.listUngraded: ${error.message}`)
  return (data ?? []) as Submission[]
}

export async function listMyActiveSubmissions(studentId: string): Promise<Submission[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_active', true)
  if (error) throw new Error(`submissions.listMine: ${error.message}`)
  return (data ?? []) as Submission[]
}

/** A student's own superseded (replaced) submissions, newest first — so they can
 *  see the earlier versions a resubmission replaced. */
export async function listMySupersededSubmissions(studentId: string): Promise<Submission[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_active', false)
    .order('submitted_at', { ascending: false })
  if (error) throw new Error(`submissions.listMineSuperseded: ${error.message}`)
  return (data ?? []) as Submission[]
}

/** The student's most recently graded submission, for the dashboard's "latest
 *  grade" widget. Sorts client-side over their own (naturally small) active
 *  submission set rather than `.not('score', 'is', null)` — the mock query
 *  builder doesn't support `.not()`, same reasoning as the `.or()` avoidance
 *  in announcements.ts. */
export async function getLatestGrade(studentId: string): Promise<Submission | null> {
  const subs = await listMyActiveSubmissions(studentId)
  const graded = subs.filter((s): s is Submission & { graded_at: string } => s.score != null && s.graded_at != null)
  graded.sort((a, b) => (a.graded_at < b.graded_at ? 1 : -1))
  return graded[0] ?? null
}

/**
 * One submission by id, RLS-scoped (admin, a tutor of its class, the student,
 * or a mentor may read it). Used to authorize grading against the submission's
 * OWN assignment/class rather than a client-supplied assignment id.
 */
export async function getSubmission(id: string): Promise<Submission | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('submissions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`submissions.get: ${error.message}`)
  return (data as Submission) ?? null
}

/** The student's current active submission for an assignment, or null. Used to
 *  block a resubmission that would wipe an already-earned mark — so it THROWS on a
 *  read error (fail closed) rather than returning null and letting the resubmit through. */
export async function getActiveSubmission(assignmentId: string, studentId: string): Promise<Submission | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(`submissions.getActive: ${error.message}`)
  return (data as Submission) ?? null
}

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
      return new ValidationError(
        'This work has been graded - ask your tutor to reopen it before resubmitting.',
      )
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
 * RLS (enrolled + own) is the enforcement here, not canManageClass — this is
 * a student submitting their own work, unchanged from the original client.
 */
export async function recordSubmission(actor: Profile, input: RecordSubmissionInput): Promise<Submission> {
  const assignment = await getAssignment(input.assignment_id)
  if (!assignment || assignment.status !== 'active') throw new NotFoundError('Assignment not found')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('replace_own_submission', {
    p_assignment_id: assignment.id,
    p_drive_link: input.drive_link,
    p_file_name: input.file_name ?? null,
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
 * submission's OWN assignment/class — NEVER a client-supplied assignment id,
 * which could name a class the caller manages while the write targets a
 * submission in a class they don't. A null score clears a previously-entered
 * mark.
 */
export async function gradeSubmission(actor: Profile, input: GradeSubmissionInput): Promise<{ assignmentId: string }> {
  const submission = await getSubmission(input.submissionId)
  if (!submission) throw new NotFoundError('Not allowed to grade this submission.')
  // Guard the resubmit race: if the student replaced this submission after the
  // tutor opened the grading UI, this row is now inactive and the report card
  // reads only the active one — so a mark saved here would silently vanish.
  if (!submission.is_active) {
    throw new ValidationError('This submission was replaced by a newer one — reload to grade the latest.')
  }
  const assignment = await getAssignment(submission.assignment_id)
  if (!assignment || !(await canManageClass(actor, assignment.class_id))) {
    throw new PermissionError('Not allowed to grade this submission.')
  }
  if (input.score != null && assignment.max_marks != null && input.score > Number(assignment.max_marks)) {
    throw new ValidationError(`Mark can't exceed the maximum (${Number(assignment.max_marks)}).`)
  }

  const admin = createAdminClient()
  // Clearing a mark (null score) also clears graded_at/graded_by, so a row never
  // sits in a "graded_at set but no score" half-state.
  const cleared = input.score == null
  const { error } = await admin
    .from('submissions')
    .update({
      score: input.score,
      feedback: input.feedback,
      graded_at: cleared ? null : new Date().toISOString(),
      graded_by: cleared ? null : actor.id,
    })
    .eq('id', input.submissionId)
  if (error) throw new Error(`submissions.grade: ${error.message}`)
  await auditPrivilegedAction(actor, 'submission.grade', 'submission', input.submissionId)
  return { assignmentId: submission.assignment_id }
}

export async function gradeSubmissionFromActionInput(
  actor: Profile,
  input: GradeSubmissionActionInput,
): Promise<{ assignmentId: string }> {
  return gradeSubmission(actor, validateGradeSubmissionInput(input))
}
