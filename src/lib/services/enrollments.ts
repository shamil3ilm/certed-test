import type { Profile } from '@/lib/auth/profile'
import {
  deactivateEnrollment,
  selectActiveEnrollments,
  selectAllActiveEnrollmentRefs,
  upsertEnrollment,
  type EnrollmentRecord,
} from '@/lib/data/class-membership'
import { selectClassStatus } from '@/lib/data/classes'
import { canManageClass } from '@/lib/permission'
import { getProfileById } from '@/lib/services/users'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError } from '@/lib/errors'
import { z } from 'zod'

export type Enrollment = EnrollmentRecord

export async function listEnrollments(classId?: string): Promise<Enrollment[]> {
  return selectActiveEnrollments(classId)
}

/**
 * Active-enrollment count per class, for the "students per class" dashboard
 * chart. Selects only `class_id` (not full rows - cheaper than `listEnrollments`)
 * and aggregates in one O(n) pass, instead of the dashboard's old pattern of
 * pulling every enrollment and re-filtering it once per class (O(classes x
 * enrollments)).
 */
export async function countEnrollmentsPerClass(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const row of await selectAllActiveEnrollmentRefs()) {
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
  // Don't add members to an archived class (soft-deleted state).
  if ((await selectClassStatus(params.classId)) !== 'active') {
    throw new ValidationError('That class is archived - restore it before enrolling students.')
  }
  await upsertEnrollment(params.studentId, params.classId)
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
  await deactivateEnrollment(params.classId, params.studentId)
  await auditPrivilegedAction(actor, 'class.unenroll', 'enrollment', params.classId)
}

export async function removeStudentFromActionInput(actor: Profile, input: EnrollmentActionInput): Promise<void> {
  await removeStudent(actor, validateEnrollmentParams(input))
}
