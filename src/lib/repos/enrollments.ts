import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Enrollment = {
  id: string
  student_id: string
  class_id: string
  created_at: string
}

export async function listEnrollments(classId?: string): Promise<Enrollment[]> {
  const supabase = await createClient()
  let query = supabase.from('enrollments').select('*').eq('active', true)
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw new Error(`enrollments.list: ${error.message}`)
  return (data ?? []) as Enrollment[]
}

// Mutations run via the service role; callers gate with canManageClass first.
export async function enroll(student_id: string, class_id: string): Promise<void> {
  const admin = createAdminClient()
  // Re-enrolling reactivates a previously soft-removed row (keeps its history).
  const { error } = await admin
    .from('enrollments')
    .upsert({ student_id, class_id, active: true }, { onConflict: 'student_id,class_id' })
  if (error) throw new Error(`enrollments.enroll: ${error.message}`)
}

/** Soft-remove (scoped by class + student) — keeps the row for later re-enrol. */
export async function unenroll(class_id: string, student_id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('enrollments')
    .update({ active: false })
    .eq('class_id', class_id)
    .eq('student_id', student_id)
  if (error) throw new Error(`enrollments.unenroll: ${error.message}`)
}
