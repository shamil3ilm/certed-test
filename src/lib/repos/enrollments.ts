import { createClient } from '@/lib/supabase/server'

export type Enrollment = {
  id: string
  student_id: string
  course_id: string
  created_at: string
}

export async function listEnrollments(courseId?: string): Promise<Enrollment[]> {
  const supabase = await createClient()
  let query = supabase.from('enrollments').select('*')
  if (courseId) query = query.eq('course_id', courseId)
  const { data, error } = await query
  if (error) throw new Error(`enrollments.list: ${error.message}`)
  return (data ?? []) as Enrollment[]
}

export async function enroll(student_id: string, course_id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('enrollments')
    .upsert({ student_id, course_id }, { onConflict: 'student_id,course_id' })
  if (error) throw new Error(`enrollments.enroll: ${error.message}`)
}

export async function unenroll(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('enrollments').delete().eq('id', id)
  if (error) throw new Error(`enrollments.unenroll: ${error.message}`)
}
