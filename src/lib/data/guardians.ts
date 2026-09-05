import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
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

export async function insertGuardian(row: GuardianInsert): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('guardians').insert(row).select('id').single()
  if (error) throw new Error(`guardians.insert: ${error.message}`)
  return (data as { id: string }).id
}

/** Delete one guardian, scoped to the student so a stray id can't reach another's row. */
export async function deleteGuardian(id: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const result = await admin.from('guardians').delete().eq('id', id).eq('student_id', studentId).select('id')
  assertMutated(result, 'guardians.delete', 'Guardian not found.')
}

/** Clear the primary flag on all of a student's guardians (before setting a new one). */
export async function clearPrimaryForStudent(studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('guardians').update({ is_primary: false }).eq('student_id', studentId)
  if (error) throw new Error(`guardians.clearPrimary: ${error.message}`)
}

/** Mark one guardian primary (scoped to the student). Callers clear the others first. */
export async function setGuardianPrimary(id: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const result = await admin
    .from('guardians')
    .update({ is_primary: true })
    .eq('id', id)
    .eq('student_id', studentId)
    .select('id')
  assertMutated(result, 'guardians.setPrimary', 'Guardian not found.')
}
