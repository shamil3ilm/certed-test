import type { Profile } from '@/lib/auth/profile'
import {
  deactivateEnrollment,
  selectActiveEnrollmentRefsByClassIds,
  selectAllActiveEnrollmentRefs,
  upsertEnrollment,
} from '@/lib/data/class-membership'
import { selectClassStatus } from '@/lib/data/classes'
import { canManageClass } from '@/lib/permission'
import { getProfileById } from '@/lib/services/users'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError } from '@/lib/errors'
import { z } from 'zod'

/**
 * Active-enrollment count per class, for the "students per class" dashboard
 * chart. Selects only `class_id` refs and aggregates them in one O(n) pass.
 */
export async function countEnrollmentsPerClass(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const row of await selectAllActiveEnrollmentRefs()) {
    counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1)
  }
  return counts
}

type EnrollmentParams = { classId: string; studentId: string }
type EnrollmentActionInput = { class_id?: FormDataEntryValue | null; student_id?: FormDataEntryValue | null }

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
  // One-to-one rule: a class has at most ONE active student. A student takes
  // several classes (one per tutor/subject); a tutor teaches one student per
  // class. Re-enrolling the SAME student is fine (idempotent).
  const activeStudentIds = (await selectActiveEnrollmentRefsByClassIds([params.classId])).map((r) => r.student_id)
  if (activeStudentIds.some((id) => id !== params.studentId)) {
    throw new ValidationError(
      'This class already has a student. Each class is one-to-one - create a separate class to assign this student to another tutor.',
    )
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
