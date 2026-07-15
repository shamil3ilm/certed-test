import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { getProfileById } from '@/lib/services/users'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, ValidationError } from '@/lib/errors'

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

export type EnrollmentParams = { classId: string; studentId: string }

/**
 * The UI only offers valid options, but a crafted POST could pair an
 * arbitrary profile id — verify it's really an active student before
 * enrolling them.
 */
export async function enrolStudent(actor: Profile, params: EnrollmentParams): Promise<void> {
  if (!(await canManageClass(actor, params.classId))) {
    throw new PermissionError('Not authorized for this class.')
  }
  const student = await getProfileById(params.studentId)
  if (!student || student.role !== 'student' || student.status !== 'active') {
    throw new ValidationError('student_id must be an active student')
  }
  const admin = createAdminClient()
  // Re-enrolling reactivates a previously soft-removed row (keeps its history).
  const { error } = await admin
    .from('enrollments')
    .upsert({ student_id: params.studentId, class_id: params.classId, active: true }, { onConflict: 'student_id,class_id' })
  if (error) throw new Error(`enrollments.enroll: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'class.enroll', entity_type: 'enrollment', entity_id: params.classId })
}

/** Soft-remove (scoped by class + student) — keeps the row for later re-enrol. */
export async function removeStudent(actor: Profile, params: EnrollmentParams): Promise<void> {
  if (!(await canManageClass(actor, params.classId))) {
    throw new PermissionError('Not authorized for this class.')
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('enrollments')
    .update({ active: false })
    .eq('class_id', params.classId)
    .eq('student_id', params.studentId)
  if (error) throw new Error(`enrollments.unenroll: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'class.unenroll', entity_type: 'enrollment', entity_id: params.classId })
}
