import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClassRow } from '@/lib/data/classes'
import { refusalOf } from '@/lib/data/rpc-refusal'

/**
 * The two writes that give a class its subject, each a single Postgres transaction (0107).
 *
 * Refusals come back as typed results, not errors: they are expected outcomes the domain turns
 * into messages. Anything else is a failure and throws.
 */

export type SubjectRefusal =
  'subject_already_taken' | 'subject_already_set' | 'student_not_eligible' | 'subject_not_found' | 'class_not_found'

/** The 0107 refusal a database error carries, if any - including one raised by its trigger
 *  under an ordinary enrolment or class write. */
export function subjectRefusalOf(error: { message: string } | null | undefined): SubjectRefusal | null {
  return refusalOf(error, [
    'subject_already_taken',
    'subject_already_set',
    'student_not_eligible',
    'subject_not_found',
    'class_not_found',
  ] as const)
}

type Refused<R extends SubjectRefusal> = { ok: false; reason: R }

export async function callCreateStudentSubjectClass(
  studentId: string,
  subjectId: string,
  name: string,
): Promise<
  { ok: true; class: ClassRow } | Refused<'subject_already_taken' | 'student_not_eligible' | 'subject_not_found'>
> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('create_student_subject_class', {
    p_student_id: studentId,
    p_subject_id: subjectId,
    p_name: name,
  })
  const refusal = refusalOf(error, ['subject_already_taken', 'student_not_eligible', 'subject_not_found'] as const)
  if (refusal) return { ok: false, reason: refusal }
  if (error) throw new Error(`classSubjects.createStudentClass: ${error.message}`)
  return { ok: true, class: data as ClassRow }
}

export async function callSetClassSubjectWhenUnset(
  classId: string,
  subjectId: string,
): Promise<
  | { ok: true; sessionsLabelled: number }
  | Refused<'subject_already_set' | 'subject_already_taken' | 'subject_not_found' | 'class_not_found'>
> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('set_class_subject_when_unset', {
    p_class_id: classId,
    p_subject_id: subjectId,
  })
  const refusal = refusalOf(error, [
    'subject_already_set',
    'subject_already_taken',
    'subject_not_found',
    'class_not_found',
  ] as const)
  if (refusal) return { ok: false, reason: refusal }
  if (error) throw new Error(`classSubjects.setWhenUnset: ${error.message}`)
  return { ok: true, sessionsLabelled: Number(data ?? 0) }
}
