import { createClient } from '@/lib/supabase/server'
import { computeStatus, type SubmissionStatus } from '@/lib/assignments/lateStatus'

export type Submission = {
  id: string
  assignment_id: string
  student_id: string
  drive_file_id: string
  drive_link: string | null
  status: SubmissionStatus
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

export async function getActiveSubmission(
  assignmentId: string,
  studentId: string,
): Promise<Submission | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .eq('is_active', true)
    .maybeSingle()
  return (data as Submission) ?? null
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

export async function getSubmission(id: string): Promise<Submission | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('submissions').select('*').eq('id', id).maybeSingle()
  return (data as Submission) ?? null
}

/** Records a submission, superseding any prior active one (kept as history). */
export async function recordSubmission(input: {
  assignment_id: string
  student_id: string
  drive_file_id: string
  drive_link: string | null
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
      drive_file_id: input.drive_file_id,
      drive_link: input.drive_link,
      submitted_at: submittedAt,
      status,
      is_active: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(`submissions.record: ${error.message}`)
  return data as Submission
}
