import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type SubmissionStatus } from '@/lib/assignments/late-status'

/**
 * Table access for `submissions`. No authorization and no policy here - the
 * domain (src/lib/services/submissions) decides who may do what; this module
 * only knows how to read and write rows.
 *
 * Reads use the RLS client, so they are already scoped to what the caller may
 * see (admin, a tutor of the class, the student, or a mentor). The service-role
 * functions each say why they bypass policy: grading and lateness re-stamping
 * sit outside submissions RLS, and the *AsService read serves the pastoral
 * mentee view.
 */

export type SubmissionRow = {
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

export async function selectActiveByAssignment(assignmentId: string): Promise<SubmissionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('is_active', true)
    .order('submitted_at', { ascending: false })
  if (error) throw new Error(`submissions.listForAssignment: ${error.message}`)
  return (data ?? []) as SubmissionRow[]
}

/** Superseded (replaced) rows for an assignment, newest first - the version
 *  history kept when a student resubmits. */
export async function selectSupersededByAssignment(assignmentId: string): Promise<SubmissionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('is_active', false)
    .order('submitted_at', { ascending: false })
  if (error) throw new Error(`submissions.listSuperseded: ${error.message}`)
  return (data ?? []) as SubmissionRow[]
}

/** Active, not-yet-graded rows across a set of assignments - the tutor's
 *  "to review" queue, oldest first. */
export async function selectUngradedByAssignments(assignmentIds: string[]): Promise<SubmissionRow[]> {
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
  return (data ?? []) as SubmissionRow[]
}

export async function selectActiveByStudent(studentId: string): Promise<SubmissionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_active', true)
  if (error) throw new Error(`submissions.listMine: ${error.message}`)
  return (data ?? []) as SubmissionRow[]
}

export async function selectSupersededByStudent(studentId: string): Promise<SubmissionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_active', false)
    .order('submitted_at', { ascending: false })
  if (error) throw new Error(`submissions.listMineSuperseded: ${error.message}`)
  return (data ?? []) as SubmissionRow[]
}

export async function selectById(id: string): Promise<SubmissionRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('submissions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`submissions.get: ${error.message}`)
  return (data as SubmissionRow) ?? null
}

/** A student's current active row for an assignment. THROWS on a read error
 *  rather than returning null, so a caller checking "is there already a mark
 *  here?" fails closed instead of reading a transient error as "nothing here". */
export async function selectActiveForStudentAssignment(
  assignmentId: string,
  studentId: string,
): Promise<SubmissionRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(`submissions.getActive: ${error.message}`)
  return (data as SubmissionRow) ?? null
}

/**
 * The submit/resubmit RPC: inserts the new row and supersedes any prior active
 * one atomically, under the student's own RLS identity.
 *
 * Deliberately RETURNS its error instead of throwing. The function signals its
 * refusals as machine-readable codes ('submission_already_graded',
 * 'not_enrolled', ...) that have to become specific, user-facing messages -
 * that mapping is a domain decision, so the domain does it.
 */
export async function callReplaceOwnSubmission(input: {
  assignmentId: string
  driveLink: string | null
  fileName: string | null
}): Promise<{ data: SubmissionRow | null; error: { message: string } | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('replace_own_submission', {
    p_assignment_id: input.assignmentId,
    p_drive_link: input.driveLink,
    p_file_name: input.fileName,
  })
  return { data: (data as SubmissionRow) ?? null, error }
}

/** Retracts a student's own row, keeping it as history. Scoped to the student
 *  in the statement itself, so it can never touch someone else's work. */
export async function markInactiveForStudent(submissionId: string, studentId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('submissions')
    .update({ is_active: false })
    .eq('id', submissionId)
    .eq('student_id', studentId)
  if (error) throw new Error(`submissions.withdraw: ${error.message}`)
}

export type SubmissionStatusRow = { id: string; submitted_at: string; status: SubmissionStatus }

/** Just what's needed to re-derive on-time/late for every submission on an
 *  assignment. Service-role, because the caller is a tutor correcting their own
 *  assignment's deadline and submissions_update RLS admits only the owning
 *  student or an admin. */
export async function selectStatusRowsByAssignment(assignmentId: string): Promise<SubmissionStatusRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('submissions')
    .select('id, submitted_at, status')
    .eq('assignment_id', assignmentId)
  if (error) throw new Error(`assignments.reclassify.read: ${error.message}`)
  return (data ?? []) as SubmissionStatusRow[]
}

/** Re-stamps one submission's on-time/late status. Service-role for the same
 *  reason as selectStatusRowsByAssignment. */
export async function updateSubmissionStatus(id: string, status: SubmissionStatus): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('submissions').update({ status }).eq('id', id)
  if (error) throw new Error(`assignments.reclassify.update: ${error.message}`)
}

/** Writes a mark. Service-role: tutor-grading is not in the submissions RLS,
 *  which only lets an admin or the student themselves write. The domain
 *  authorizes against the submission's own class before calling this. */
export async function updateGrade(
  submissionId: string,
  patch: { score: number | null; feedback: string | null; graded_at: string | null; graded_by: string | null },
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('submissions').update(patch).eq('id', submissionId)
  if (error) throw new Error(`submissions.grade: ${error.message}`)
}

export type SubmissionBrief = {
  assignment_id: string
  status: SubmissionStatus
  submitted_at: string
  drive_link: string | null
}

/**
 * A student's active submissions, SERVICE-ROLE and therefore NOT scoped to the
 * caller. Same reason as selectActiveAssignmentsByClassIdsAsService: the
 * pastoral mentee view is read by a mentor who may not teach the class. The
 * caller MUST have proved the mentorship (or admin) first.
 */
export async function selectActiveSubmissionsForStudentAsService(studentId: string): Promise<SubmissionBrief[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('submissions')
    .select('assignment_id, status, submitted_at, drive_link')
    .eq('student_id', studentId)
    .eq('is_active', true)
  return (data ?? []) as SubmissionBrief[]
}

/** Who owns a submission and which assignment it belongs to, SERVICE-ROLE, for
 *  the comment authorization check - same missing-vs-invisible reasoning. */
export async function selectSubmissionOwnerAsService(
  id: string,
): Promise<{ student_id: string; assignment_id: string } | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('submissions').select('student_id, assignment_id').eq('id', id).maybeSingle()
  return (data as { student_id: string; assignment_id: string }) ?? null
}

/** Every active submission's assignment + score for one student, SERVICE-ROLE.
 *  Feeds the report card, which a mentor or admin may pull for a student whose
 *  classes they don't teach. THROWS on error - a transient failure must not
 *  quietly become a blank report card handed to a parent as fact. */
export async function selectScoresForStudentAsService(
  studentId: string,
): Promise<{ assignment_id: string; score: number | null }[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('submissions')
    .select('assignment_id, score')
    .eq('student_id', studentId)
    .eq('is_active', true)
  if (error) throw new Error(`reportCard.subs: ${error.message}`)
  return (data ?? []) as { assignment_id: string; score: number | null }[]
}
