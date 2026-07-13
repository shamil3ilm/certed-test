import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeStatus, type SubmissionStatus } from '@/lib/assignments/lateStatus'

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

/** Records a submission, superseding any prior active one (kept as history). */
export async function recordSubmission(input: {
  assignment_id: string
  student_id: string
  drive_link: string | null
  file_name?: string | null
  due_date: string
}): Promise<Submission> {
  const supabase = await createClient()
  const submittedAt = new Date().toISOString()
  const status = computeStatus(submittedAt, input.due_date)

  await supabase
    .from('submissions')
    .update({ is_active: false })
    .eq('assignment_id', input.assignment_id)
    .eq('student_id', input.student_id)
    .eq('is_active', true)

  const { data, error } = await supabase
    .from('submissions')
    .insert({
      assignment_id: input.assignment_id,
      student_id: input.student_id,
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

/**
 * Records a tutor's mark + feedback on a submission. Runs via the service role
 * because teacher-grading isn't in the submissions RLS (which only lets an admin
 * or the student themselves write); the caller gates with canManageClass first.
 * A null score clears a previously-entered mark.
 */
export async function gradeSubmission(
  id: string,
  input: { score: number | null; feedback: string | null; gradedBy: string },
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('submissions')
    .update({
      score: input.score,
      feedback: input.feedback,
      graded_at: new Date().toISOString(),
      graded_by: input.gradedBy,
    })
    .eq('id', id)
  if (error) throw new Error(`submissions.grade: ${error.message}`)
}
