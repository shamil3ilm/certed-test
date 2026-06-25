import { createClient } from '@/lib/supabase/server'

export type CourseTeacher = {
  id: string
  teacher_id: string
  course_id: string
  created_at: string
}

export async function listCourseTeachers(courseId?: string): Promise<CourseTeacher[]> {
  const supabase = await createClient()
  let query = supabase.from('course_teachers').select('*')
  if (courseId) query = query.eq('course_id', courseId)
  const { data, error } = await query
  if (error) throw new Error(`courseTeachers.list: ${error.message}`)
  return (data ?? []) as CourseTeacher[]
}

export async function assignTeacher(teacher_id: string, course_id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('course_teachers')
    .upsert({ teacher_id, course_id }, { onConflict: 'teacher_id,course_id' })
  if (error) throw new Error(`courseTeachers.assign: ${error.message}`)
}

export async function unassignTeacher(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('course_teachers').delete().eq('id', id)
  if (error) throw new Error(`courseTeachers.unassign: ${error.message}`)
}
