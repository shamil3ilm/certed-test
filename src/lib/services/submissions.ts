import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { computeStatus, type SubmissionStatus } from '@/lib/assignments/lateStatus'
import { canManageClass } from '@/lib/permission'
import { getAssignment } from '@/lib/services/assignments'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

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

/** Active, not-yet-graded submissions across a set of assignments — the tutor's
 *  "to review" queue. RLS still scopes reads to a teacher of those classes. */
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

/**
 * One submission by id, RLS-scoped (admin, a teacher of its class, the student,
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

/**
 * Records a submission, superseding any prior active one (kept as history).
 * RLS (enrolled + own) is the enforcement here, not canManageClass — this is
 * a student submitting their own work, unchanged from the original client.
 */
export async function recordSubmission(actor: Profile, input: RecordSubmissionInput): Promise<Submission> {
  const assignment = await getAssignment(input.assignment_id)
  if (!assignment || assignment.status !== 'active') throw new NotFoundError('Assignment not found')

  // Don't let a resubmission supersede an already-graded submission — it would
  // hide the mark from the report card + classwork until re-graded. The tutor
  // reopens it by clearing the mark.
  const current = await getActiveSubmission(assignment.id, actor.id)
  if (current && current.score != null) {
    throw new ValidationError('This work has been graded — ask your tutor to reopen it before resubmitting.')
  }

  const supabase = await createClient()
  const submittedAt = new Date().toISOString()
  const status = computeStatus(submittedAt, assignment.due_date)

  await supabase
    .from('submissions')
    .update({ is_active: false })
    .eq('assignment_id', assignment.id)
    .eq('student_id', actor.id)
    .eq('is_active', true)

  const { data, error } = await supabase
    .from('submissions')
    .insert({
      assignment_id: assignment.id,
      student_id: actor.id,
      drive_link: input.drive_link,
      file_name: input.file_name ?? null,
      submitted_at: submittedAt,
      status,
      is_active: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(`submissions.record: ${error.message}`)
  return data as Submission
}

export type GradeSubmissionInput = {
  submissionId: string
  score: number | null
  feedback: string | null
}

/**
 * Records a tutor's mark + feedback on a submission. Runs via the service
 * role because teacher-grading isn't in the submissions RLS (which only lets
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
  await writeAudit({
    actor_id: actor.id,
    action: 'submission.grade',
    entity_type: 'submission',
    entity_id: input.submissionId,
  })
  return { assignmentId: submission.assignment_id }
}
