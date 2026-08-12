import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertMutated } from '@/lib/data/mutation'

/**
 * Table access for the two membership tables - `class_tutors` and `enrollments`.
 * They live together because every caller reads them as a pair: a class's people,
 * a person's classes, a set of classes' head counts.
 *
 * Every read is filtered to `active = true`.
 *
 * Two kinds of read live here, and the difference matters:
 *
 *  - AGGREGATION reads (the *Refs* and *RowsFor* / *IdsFor* functions) are
 *    service-role. They resolve the membership graph on a caller's behalf, so
 *    the domain MUST scope by that caller's own membership before using them.
 *  - DIRECT reads (selectAllActiveEnrollmentRefs) are RLS-scoped, because they
 *    answer a caller's own question and policy can safely bound the answer.
 *
 * The writes are service-role, and gated in the domain.
 */

export type MembershipRef = { class_id: string }
type ClassTutorRow = { id: string; tutor_id: string }
type EnrollmentRow = { id: string; student_id: string }

/** Class ids this tutor actively teaches. */
export async function selectActiveClassIdsForTutor(tutorId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('class_tutors').select('class_id').eq('tutor_id', tutorId).eq('active', true)
  if (error) throw new Error(`classMembership.classIdsForTutor: ${error.message}`)
  return ((data ?? []) as MembershipRef[]).map((r) => r.class_id)
}

/** Class ids this student is actively enrolled in. */
export async function selectActiveClassIdsForStudent(studentId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('enrollments')
    .select('class_id')
    .eq('student_id', studentId)
    .eq('active', true)
  if (error) throw new Error(`classMembership.classIdsForStudent: ${error.message}`)
  return ((data ?? []) as MembershipRef[]).map((r) => r.class_id)
}

/** Distinct active class ids across the given students (batch of the single-student
 *  version) - resolves a mentor's mentees' classes when finding messaging contacts. */
export async function selectActiveClassIdsForStudents(studentIds: string[]): Promise<string[]> {
  if (studentIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('enrollments')
    .select('class_id')
    .in('student_id', studentIds)
    .eq('active', true)
  if (error) throw new Error(`classMembership.classIdsForStudents: ${error.message}`)
  return [...new Set(((data ?? []) as MembershipRef[]).map((r) => r.class_id))]
}

export type EnrollmentRef = { student_id: string; class_id: string }

/** Active enrollments for a set of students, keeping `student_id` so the caller
 *  can group class ids per student - the batched form of
 *  selectActiveClassIdsForStudent for the mentor dashboard's whole cohort. */
export async function selectActiveEnrollmentsForStudents(studentIds: string[]): Promise<EnrollmentRef[]> {
  if (studentIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('enrollments')
    .select('student_id, class_id')
    .in('student_id', studentIds)
    .eq('active', true)
  if (error) throw new Error(`classMembership.enrollmentsForStudents: ${error.message}`)
  return (data ?? []) as EnrollmentRef[]
}

/** One row per active teaching assignment across the given classes, carrying the
 *  tutor id - the caller tallies counts AND resolves names (1-on-1 class cards). */
export async function selectActiveTutorRefsByClassIds(
  classIds: string[],
): Promise<Array<{ class_id: string; tutor_id: string }>> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_tutors')
    .select('class_id, tutor_id')
    .in('class_id', classIds)
    .eq('active', true)
  if (error) throw new Error(`classMembership.tutorRefsByClassIds: ${error.message}`)
  return (data ?? []) as Array<{ class_id: string; tutor_id: string }>
}

/** One row per active enrolment across the given classes, carrying the student id. */
export async function selectActiveEnrollmentRefsByClassIds(
  classIds: string[],
): Promise<Array<{ class_id: string; student_id: string }>> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('enrollments')
    .select('class_id, student_id')
    .in('class_id', classIds)
    .eq('active', true)
  if (error) throw new Error(`classMembership.enrollmentRefsByClassIds: ${error.message}`)
  return (data ?? []) as Array<{ class_id: string; student_id: string }>
}

/** Active teaching rows for one class. The row id is returned alongside the
 *  tutor id because the People page needs it to remove that assignment. */
export async function selectActiveTutorRowsForClass(classId: string): Promise<ClassTutorRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_tutors')
    .select('id, tutor_id')
    .eq('class_id', classId)
    .eq('active', true)
  if (error) throw new Error(`classMembership.tutorRowsForClass: ${error.message}`)
  return (data ?? []) as ClassTutorRow[]
}

/** Active enrolment rows for one class, row id included for the same reason. */
export async function selectActiveEnrollmentRowsForClass(classId: string): Promise<EnrollmentRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('enrollments')
    .select('id, student_id')
    .eq('class_id', classId)
    .eq('active', true)
  if (error) throw new Error(`classMembership.enrollmentRowsForClass: ${error.message}`)
  return (data ?? []) as EnrollmentRow[]
}

/** Re-assigning reactivates a previously soft-removed row rather than adding a
 *  second one for the same pair. */
export async function upsertClassTutor(tutorId: string, classId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('class_tutors')
    .upsert({ tutor_id: tutorId, class_id: classId, active: true }, { onConflict: 'tutor_id,class_id' })
  if (error) throw new Error(`classTutors.assign: ${error.message}`)
}

/** Soft-remove, scoped by class AND tutor - keeps the row for a later re-assign.
 *  `.select()`s so a call for a pair that was never an assignment matches 0 rows
 *  and fails loudly with NotFound, rather than returning success and letting the
 *  caller audit a `class.unassign_tutor` that never happened. A row that already
 *  exists (active OR inactive) still matches, so an idempotent re-remove is fine. */
export async function deactivateClassTutor(classId: string, tutorId: string): Promise<void> {
  const admin = createAdminClient()
  const result = await admin
    .from('class_tutors')
    .update({ active: false })
    .eq('class_id', classId)
    .eq('tutor_id', tutorId)
    .select('id')
  assertMutated(result, 'classTutors.unassign', 'That tutor is not assigned to this class.')
}

/** Just the class_id of every active enrolment - cheaper than whole rows when
 *  the caller only wants to tally head counts. RLS-scoped. */
export async function selectAllActiveEnrollmentRefs(): Promise<MembershipRef[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('enrollments').select('class_id').eq('active', true)
  if (error) throw new Error(`enrollments.countPerClass: ${error.message}`)
  return (data ?? []) as MembershipRef[]
}

/** Re-enrolling reactivates a previously soft-removed row, keeping its history. */
export async function upsertEnrollment(studentId: string, classId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('enrollments')
    .upsert({ student_id: studentId, class_id: classId, active: true }, { onConflict: 'student_id,class_id' })
  if (error) throw new Error(`enrollments.enroll: ${error.message}`)
}

/** Soft-remove, scoped by class AND student - keeps the row for a later re-enrol.
 *  `.select()`s so a call for a pair that was never an enrollment matches 0 rows
 *  and fails loudly with NotFound, rather than returning success and letting the
 *  caller audit a `class.unenroll` that never happened. A row that already exists
 *  (active OR inactive) still matches, so an idempotent re-remove is fine. */
export async function deactivateEnrollment(classId: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const result = await admin
    .from('enrollments')
    .update({ active: false })
    .eq('class_id', classId)
    .eq('student_id', studentId)
    .select('id')
  assertMutated(result, 'enrollments.unenroll', 'That student is not enrolled in this class.')
}

/** Student ids actively enrolled in any of the given classes. Service-role
 *  aggregation - the caller must have scoped `classIds` to its own membership. */
export async function selectActiveStudentIdsByClassIds(classIds: string[]): Promise<string[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('enrollments')
    .select('student_id')
    .in('class_id', classIds)
    .eq('active', true)
  if (error) throw new Error(`classMembership.studentIdsByClassIds: ${error.message}`)
  return ((data ?? []) as { student_id: string }[]).map((r) => r.student_id)
}

/** Tutor ids actively teaching any of the given classes. Same contract. */
export async function selectActiveTutorIdsByClassIds(classIds: string[]): Promise<string[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_tutors')
    .select('tutor_id')
    .in('class_id', classIds)
    .eq('active', true)
  if (error) throw new Error(`classMembership.tutorIdsByClassIds: ${error.message}`)
  return ((data ?? []) as { tutor_id: string }[]).map((r) => r.tutor_id)
}

/**
 * Pair reads: the (person, class) edges themselves, not just one side. A caller
 * that needs a per-person class map (e.g. "which of my taught classes is each
 * student in") builds it from ONE of these instead of one query per person.
 * Service-role aggregation - scope the ids to the caller's own membership.
 */
export type EnrollmentPair = { student_id: string; class_id: string }
export type TutorPair = { tutor_id: string; class_id: string }

/** (student_id, class_id) for every active enrolment in the given classes. */
export async function selectActiveEnrollmentPairsByClassIds(classIds: string[]): Promise<EnrollmentPair[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('enrollments')
    .select('student_id, class_id')
    .in('class_id', classIds)
    .eq('active', true)
  if (error) throw new Error(`classMembership.enrollmentPairsByClassIds: ${error.message}`)
  return (data ?? []) as EnrollmentPair[]
}

/** (student_id, class_id) for every active enrolment of the given students. */
export async function selectActiveEnrollmentPairsByStudentIds(studentIds: string[]): Promise<EnrollmentPair[]> {
  if (studentIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('enrollments')
    .select('student_id, class_id')
    .in('student_id', studentIds)
    .eq('active', true)
  if (error) throw new Error(`classMembership.enrollmentPairsByStudentIds: ${error.message}`)
  return (data ?? []) as EnrollmentPair[]
}

/** (tutor_id, class_id) for every active teaching assignment in the given classes. */
export async function selectActiveTutorPairsByClassIds(classIds: string[]): Promise<TutorPair[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_tutors')
    .select('tutor_id, class_id')
    .in('class_id', classIds)
    .eq('active', true)
  if (error) throw new Error(`classMembership.tutorPairsByClassIds: ${error.message}`)
  return (data ?? []) as TutorPair[]
}

/** Which of the given staff ids are actively teaching at least one class. */
export async function selectActiveTeachingProfileIds(profileIds: string[]): Promise<string[]> {
  if (profileIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_tutors')
    .select('tutor_id')
    .in('tutor_id', profileIds)
    .eq('active', true)
  if (error) throw new Error(`classMembership.activeTeachingProfileIds: ${error.message}`)
  return [...new Set(((data ?? []) as { tutor_id: string }[]).map((row) => row.tutor_id))]
}

/**
 * Membership existence checks, SERVICE-ROLE. These back the permission layer
 * (canManageClass / canAccessClass), so they must see the row regardless of the
 * caller's own policy - an RLS read here would ask "may you see this membership"
 * when the question is "are you a member", and the two differ precisely in the
 * cases access control exists for.
 */

export async function isActiveClassTutor(tutorId: string, classId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_tutors')
    .select('id')
    .eq('tutor_id', tutorId)
    .eq('class_id', classId)
    .eq('active', true)
    .maybeSingle()
  if (error) throw new Error(`classMembership.isActiveClassTutor: ${error.message}`)
  return !!data
}

export async function isActiveEnrollee(studentId: string, classId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .eq('active', true)
    .maybeSingle()
  if (error) throw new Error(`classMembership.isActiveEnrollee: ${error.message}`)
  return !!data
}
