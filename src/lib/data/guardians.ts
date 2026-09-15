import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { NotFoundError } from '@/lib/errors'
import { assertMutated } from './mutation'

/**
 * Table access for `guardians` - a student's parent/guardian contacts (one row each,
 * both parents when applicable). Admin-managed: writes go through the service-role
 * client after the app's tier check (see services/guardians.ts). Every mutation is
 * scoped by student_id as well as id, so a call can only ever touch the intended
 * student's rows.
 */

export type GuardianRow = {
  id: string
  student_id: string
  name: string
  phone: string | null
  email: string | null
  relationship: string | null
  is_primary: boolean
}

export type GuardianInsert = {
  student_id: string
  name: string
  phone: string | null
  email: string | null
  relationship: string | null
  is_primary: boolean
}

const COLS = 'id, student_id, name, phone, email, relationship, is_primary'

/** Hard-delete every guardian row for a student - used by erasure. The
 *  guardians FK cascades on a profile DELETE, but erasure keeps the profile row (so audit /
 *  finance FKs survive), so that cascade never fires; this removes the guardian's PII (name,
 *  phone, email, relationship) explicitly. */
export async function deleteGuardiansForStudent(studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('guardians').delete().eq('student_id', studentId)
  if (error) throw new Error(`data.guardians.deleteForStudent: ${error.message}`)
}

/** A student's guardians, primary first then oldest. */
export async function selectGuardiansByStudent(studentId: string): Promise<GuardianRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('guardians')
    .select(COLS)
    .eq('student_id', studentId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`guardians.selectByStudent: ${error.message}`)
  return (data ?? []) as GuardianRow[]
}

/** Add a guardian; a primary one takes the flag from any other in the same transaction (0108),
 *  so a student never has two primaries, nor none after a failed insert. Returns the new id. */
export async function callAddGuardian(row: GuardianInsert): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('add_guardian', {
    p_student_id: row.student_id,
    p_name: row.name,
    p_phone: row.phone,
    p_email: row.email,
    p_relationship: row.relationship,
    p_is_primary: row.is_primary,
  })
  if (error) throw new Error(`guardians.add: ${error.message}`)
  return data as string
}

/** Delete one guardian, scoped to the student so a stray id can't reach another's row. */
export async function deleteGuardian(id: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const result = await admin.from('guardians').delete().eq('id', id).eq('student_id', studentId).select('id')
  assertMutated(result, 'guardians.delete', 'Guardian not found.')
}

/** Make one of the student's guardians the primary, moving the flag in one transaction (0108).
 *  A guardian that is not this student's changes nothing and fails NotFound, so a stale id
 *  cannot clear the real primary on its way to failing. */
export async function callMakeGuardianPrimary(id: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('make_guardian_primary', { p_student_id: studentId, p_guardian_id: id })
  if (error) throw new Error(`guardians.makePrimary: ${error.message}`)
  if (data !== true) throw new NotFoundError('Guardian not found.')
}
