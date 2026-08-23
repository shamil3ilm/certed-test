import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

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

export async function insertGuardian(row: GuardianInsert): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('guardians').insert(row)
  if (error) throw new Error(`guardians.insert: ${error.message}`)
}

/** Delete one guardian, scoped to the student so a stray id can't reach another's row. */
export async function deleteGuardian(id: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('guardians').delete().eq('id', id).eq('student_id', studentId)
  if (error) throw new Error(`guardians.delete: ${error.message}`)
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
  const { error } = await admin.from('guardians').update({ is_primary: true }).eq('id', id).eq('student_id', studentId)
  if (error) throw new Error(`guardians.setPrimary: ${error.message}`)
}
