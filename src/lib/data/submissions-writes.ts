import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubmissionRow } from './submissions-shared'

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
 *  in the statement itself, so it can never touch someone else's work. The
 *  score/graded_at guards make "only ungraded work can be withdrawn" atomic:
 *  a grade landing concurrently leaves 0 rows affected instead of racing.
 *  Returns true if a row was retracted, false if none matched (already graded,
 *  withdrawn, or replaced by a newer submission). */
export async function markInactiveForStudent(submissionId: string, studentId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .update({ is_active: false })
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .eq('is_active', true)
    .is('score', null)
    .is('graded_at', null)
    .select('id')
  if (error) throw new Error(`submissions.withdraw: ${error.message}`)
  return (data?.length ?? 0) > 0
}

/** Writes a mark. Service-role: tutor-grading is not in the submissions RLS,
 *  which only lets an admin or the student themselves write. The domain
 *  authorizes against the submission's own class before calling this. */
export async function updateGrade(
  submissionId: string,
  patch: { score: number | null; feedback: string | null; graded_at: string | null; graded_by: string | null },
): Promise<boolean> {
  const admin = createAdminClient()
  // Guard on is_active in the statement itself: if the student withdrew or
  // resubmitted after the tutor opened the grading UI, this row is now inactive
  // and 0 rows match - so a mark can never land on a superseded row (where the
  // report card, which reads only the active submission, would never see it).
  const { data, error } = await admin
    .from('submissions')
    .update(patch)
    .eq('id', submissionId)
    .eq('is_active', true)
    .select('id')
  if (error) throw new Error(`submissions.grade: ${error.message}`)
  return (data?.length ?? 0) > 0
}
