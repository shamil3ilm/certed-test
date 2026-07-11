import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ClassTeacher = {
  id: string
  teacher_id: string
  class_id: string
  created_at: string
}

export async function listClassTeachers(classId?: string): Promise<ClassTeacher[]> {
  const supabase = await createClient()
  let query = supabase.from('class_teachers').select('*').eq('active', true)
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw new Error(`classTeachers.list: ${error.message}`)
  return (data ?? []) as ClassTeacher[]
}

// Mutations run via the service role; callers gate with canManageClass first.
export async function assignTeacher(teacher_id: string, class_id: string): Promise<void> {
  const admin = createAdminClient()
  // Re-assigning reactivates a previously soft-removed row.
  const { error } = await admin
    .from('class_teachers')
    .upsert({ teacher_id, class_id, active: true }, { onConflict: 'teacher_id,class_id' })
  if (error) throw new Error(`classTeachers.assign: ${error.message}`)
}

/** Soft-remove (scoped by class + teacher) — keeps the row for later re-assign. */
export async function unassignTeacher(class_id: string, teacher_id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('class_teachers')
    .update({ active: false })
    .eq('class_id', class_id)
    .eq('teacher_id', teacher_id)
  if (error) throw new Error(`classTeachers.unassign: ${error.message}`)
}
