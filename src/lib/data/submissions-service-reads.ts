import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EvaluatedSubmissionBrief, SubmissionBrief } from './submissions-shared'

/**
 * A student's active submissions, SERVICE-ROLE and therefore NOT scoped to the
 * caller. Same reason as selectActiveAssignmentsByClassIdsAsService: the
 * pastoral mentee view is read by a mentor who may not teach the class. The
 * caller MUST have proved the mentorship (or admin) first.
 */
export async function selectActiveSubmissionsForStudentAsService(studentId: string): Promise<SubmissionBrief[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('submissions')
    .select('assignment_id, status, submitted_at, drive_link')
    .eq('student_id', studentId)
    .eq('is_active', true)
  // Fail loud, like selectScoresForStudentAsService below: a transient DB error
  // must not become a silently blank mentee overview ("no submissions") for a
  // student who actually has them.
  if (error) throw new Error(`menteeOverview.subs: ${error.message}`)
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

/** A student's active graded submissions, SERVICE-ROLE, for mentor/admin
 *  evaluation views. The caller must already have proved oversight access. */
export async function selectEvaluatedSubmissionsForStudentAsService(
  studentId: string,
): Promise<EvaluatedSubmissionBrief[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('submissions')
    .select('assignment_id, status, submitted_at, drive_link, score, graded_at')
    .eq('student_id', studentId)
    .eq('is_active', true)
    .not('score', 'is', null)
    .not('graded_at', 'is', null)
  if (error) throw new Error(`menteeOverview.gradedSubs: ${error.message}`)
  return (data ?? []) as EvaluatedSubmissionBrief[]
}
