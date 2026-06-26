import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Mentorship = {
  id: string
  teacher_id: string
  student_id: string
  created_at: string
}

/** RLS-scoped list (admin: all, teacher: own, student: own). */
export async function listMentorships(): Promise<Mentorship[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('mentorships').select('*')
  if (error) throw new Error(`mentorships.list: ${error.message}`)
  return (data ?? []) as Mentorship[]
}

/** Student ids assigned to a teacher. */
export async function studentIdsOfTeacher(teacherId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('mentorships').select('student_id').eq('teacher_id', teacherId)
  if (error) throw new Error(`mentorships.studentsOf: ${error.message}`)
  return (data ?? []).map((r) => (r as { student_id: string }).student_id)
}

/** Assign a student to a teacher (idempotent). Admin-only via RLS. */
export async function assignMentor(teacherId: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('mentorships')
    .upsert({ teacher_id: teacherId, student_id: studentId }, { onConflict: 'teacher_id,student_id' })
  if (error) throw new Error(`mentorships.assign: ${error.message}`)
}

/** Remove a mentorship link by id. Admin-only via RLS. */
export async function removeMentor(id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('mentorships').delete().eq('id', id)
  if (error) throw new Error(`mentorships.remove: ${error.message}`)
}
