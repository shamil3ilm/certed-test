import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { getProfileById } from '@/lib/services/users'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError } from '@/lib/errors'
import { z } from 'zod'

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

/**
 * Active-enrollment count per class, for the "students per class" dashboard
 * chart. Selects only `class_id` (not full rows - cheaper than `listEnrollments`)
 * and aggregates in one O(n) pass, instead of the dashboard's old pattern of
 * pulling every enrollment and re-filtering it once per class (O(classes x
 * enrollments)).
 */
export async function countEnrollmentsPerClass(): Promise<Map<string, number>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('enrollments').select('class_id').eq('active', true)
  if (error) throw new Error(`enrollments.countPerClass: ${error.message}`)
  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { class_id: string }[]) {
    counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1)
  }
  return counts
}

export type EnrollmentParams = { classId: string; studentId: string }
export type EnrollmentActionInput = { class_id?: FormDataEntryValue | null; student_id?: FormDataEntryValue | null }

const enrollmentParamsSchema = z.object({
  classId: z.string().uuid(),
  studentId: z.string().uuid(),
})

export function validateEnrollmentParams(input: EnrollmentActionInput): EnrollmentParams {
  const parsed = enrollmentParamsSchema.safeParse({
    classId: String(input.class_id ?? ''),
    studentId: String(input.student_id ?? ''),
  })
  if (!parsed.success) {
    throw new ValidationError('Invalid enrollment data')
  }
  return parsed.data
}

/**
 * The UI only offers valid options, but a crafted POST could pair an
 * arbitrary profile id - verify it's really an active student before
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
  await auditPrivilegedAction(actor, 'class.enroll', 'enrollment', params.classId)
}

export async function enrolStudentFromActionInput(actor: Profile, input: EnrollmentActionInput): Promise<void> {
  await enrolStudent(actor, validateEnrollmentParams(input))
}

/** Soft-remove (scoped by class + student) - keeps the row for later re-enrol. */
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
  await auditPrivilegedAction(actor, 'class.unenroll', 'enrollment', params.classId)
}

export async function removeStudentFromActionInput(actor: Profile, input: EnrollmentActionInput): Promise<void> {
  await removeStudent(actor, validateEnrollmentParams(input))
}
