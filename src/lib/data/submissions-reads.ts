import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { SubmissionRow } from './submissions-shared'

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

/** All active submissions across a set of assignments, graded or not - so a caller
 *  can count graded vs pending in one read. Score is filtered in memory by the
 *  caller (the mock query builder doesn't support `.not('score', 'is', null)`). */
export async function selectActiveByAssignments(assignmentIds: string[]): Promise<SubmissionRow[]> {
  if (assignmentIds.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .in('assignment_id', assignmentIds)
    .eq('is_active', true)
    .order('submitted_at', { ascending: true })
  if (error) throw new Error(`submissions.listActive: ${error.message}`)
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

/** The student's own active submission for one assignment, or null (RLS-scoped).
 *  Lets the submit flow attach a file to an EXISTING submission rather than
 *  replacing it, which would orphan any file already attached to it. */
export async function selectActiveByStudentAndAssignment(
  studentId: string,
  assignmentId: string,
): Promise<SubmissionRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('assignment_id', assignmentId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(`submissions.mineForAssignment: ${error.message}`)
  return (data as SubmissionRow) ?? null
}

export async function selectById(id: string): Promise<SubmissionRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('submissions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`submissions.get: ${error.message}`)
  return (data as SubmissionRow) ?? null
}
