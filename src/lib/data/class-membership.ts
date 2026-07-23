import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
 *  - DIRECT reads (selectActiveClassTutors, selectActiveEnrollments,
 *    selectAllActiveEnrollmentRefs) are RLS-scoped, because they answer a
 *    caller's own question and policy can safely bound the answer.
 *
 * The writes are service-role, and gated in the domain.
 */

export type MembershipRef = { class_id: string }
export type ClassTutorRow = { id: string; tutor_id: string }
export type EnrollmentRow = { id: string; student_id: string }

/** Class ids this tutor actively teaches. */
export async function selectActiveClassIdsForTutor(tutorId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('class_tutors').select('class_id').eq('tutor_id', tutorId).eq('active', true)
  return ((data ?? []) as MembershipRef[]).map((r) => r.class_id)
}

/** Class ids this student is actively enrolled in. */
export async function selectActiveClassIdsForStudent(studentId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('enrollments').select('class_id').eq('student_id', studentId).eq('active', true)
  return ((data ?? []) as MembershipRef[]).map((r) => r.class_id)
}

/** One `class_id` per active teaching assignment across the given classes -
 *  the caller tallies them into per-class tutor counts. */
export async function selectActiveTutorRefsByClassIds(classIds: string[]): Promise<MembershipRef[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin.from('class_tutors').select('class_id').in('class_id', classIds).eq('active', true)
  return (data ?? []) as MembershipRef[]
}

/** One `class_id` per active enrolment across the given classes. */
export async function selectActiveEnrollmentRefsByClassIds(classIds: string[]): Promise<MembershipRef[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin.from('enrollments').select('class_id').in('class_id', classIds).eq('active', true)
  return (data ?? []) as MembershipRef[]
}

/** Active teaching rows for one class. The row id is returned alongside the
 *  tutor id because the People page needs it to remove that assignment. */
export async function selectActiveTutorRowsForClass(classId: string): Promise<ClassTutorRow[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('class_tutors').select('id, tutor_id').eq('class_id', classId).eq('active', true)
  return (data ?? []) as ClassTutorRow[]
}

/** Active enrolment rows for one class, row id included for the same reason. */
export async function selectActiveEnrollmentRowsForClass(classId: string): Promise<EnrollmentRow[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('enrollments').select('id, student_id').eq('class_id', classId).eq('active', true)
  return (data ?? []) as EnrollmentRow[]
}

export type ClassTutorRecord = {
  id: string
  tutor_id: string
  class_id: string
  created_at: string
}

/** Active teaching assignments, optionally for one class. RLS-scoped, unlike
 *  the aggregation reads above - this one answers a caller's own question
 *  rather than resolving the graph on their behalf. */
export async function selectActiveClassTutors(classId?: string): Promise<ClassTutorRecord[]> {
  const supabase = await createClient()
  let query = supabase.from('class_tutors').select('*').eq('active', true)
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw new Error(`classTutors.list: ${error.message}`)
  return (data ?? []) as ClassTutorRecord[]
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

/** Soft-remove, scoped by class AND tutor - keeps the row for a later re-assign. */
export async function deactivateClassTutor(classId: string, tutorId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('class_tutors')
    .update({ active: false })
    .eq('class_id', classId)
    .eq('tutor_id', tutorId)
  if (error) throw new Error(`classTutors.unassign: ${error.message}`)
}

export type EnrollmentRecord = {
  id: string
  student_id: string
  class_id: string
  created_at: string
}

/** Active enrolments, optionally for one class. RLS-scoped, like
 *  selectActiveClassTutors. */
export async function selectActiveEnrollments(classId?: string): Promise<EnrollmentRecord[]> {
  const supabase = await createClient()
  let query = supabase.from('enrollments').select('*').eq('active', true)
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw new Error(`enrollments.list: ${error.message}`)
  return (data ?? []) as EnrollmentRecord[]
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

/** Soft-remove, scoped by class AND student - keeps the row for a later re-enrol. */
export async function deactivateEnrollment(classId: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('enrollments')
    .update({ active: false })
    .eq('class_id', classId)
    .eq('student_id', studentId)
  if (error) throw new Error(`enrollments.unenroll: ${error.message}`)
}

/** Student ids actively enrolled in any of the given classes. Service-role
 *  aggregation - the caller must have scoped `classIds` to its own membership. */
export async function selectActiveStudentIdsByClassIds(classIds: string[]): Promise<string[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin.from('enrollments').select('student_id').in('class_id', classIds).eq('active', true)
  return ((data ?? []) as { student_id: string }[]).map((r) => r.student_id)
}

/** Tutor ids actively teaching any of the given classes. Same contract. */
export async function selectActiveTutorIdsByClassIds(classIds: string[]): Promise<string[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin.from('class_tutors').select('tutor_id').in('class_id', classIds).eq('active', true)
  return ((data ?? []) as { tutor_id: string }[]).map((r) => r.tutor_id)
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
  const { data } = await admin
    .from('class_tutors')
    .select('id')
    .eq('tutor_id', tutorId)
    .eq('class_id', classId)
    .eq('active', true)
    .maybeSingle()
  return !!data
}

export async function isActiveEnrollee(studentId: string, classId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .eq('active', true)
    .maybeSingle()
  return !!data
}
