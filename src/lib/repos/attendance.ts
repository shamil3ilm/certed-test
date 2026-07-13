import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// The status type + the pure summary live in a server-free module so they can be
// unit-tested and reused on the client; re-exported here for existing callers.
export { summarizeAttendance } from '@/lib/attendance/summary'
export type { AttendanceStatus, AttendanceSummary } from '@/lib/attendance/summary'
import type { AttendanceStatus } from '@/lib/attendance/summary'

export type AttendanceRow = {
  id: string
  class_id: string
  student_id: string
  session_date: string // 'YYYY-MM-DD'
  status: AttendanceStatus
  marked_by: string | null
  created_at: string
  updated_at: string
}

/** Every student's mark for one class on one session date. */
export async function listAttendanceForClassDate(classId: string, date: string): Promise<AttendanceRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('class_id', classId)
    .eq('session_date', date)
  if (error) throw new Error(`attendance.listForClassDate: ${error.message}`)
  return (data ?? []) as AttendanceRow[]
}

/** One student's attendance history (newest first), optionally scoped to a class. */
export async function listAttendanceForStudent(studentId: string, classId?: string): Promise<AttendanceRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('attendance')
    .select('*')
    .eq('student_id', studentId)
    .order('session_date', { ascending: false })
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw new Error(`attendance.listForStudent: ${error.message}`)
  return (data ?? []) as AttendanceRow[]
}

export type AttendanceMark = {
  class_id: string
  student_id: string
  session_date: string
  status: AttendanceStatus
  marked_by: string
}

/**
 * Upserts a whole class's marks for a session date in ONE call — atomic (a
 * partial failure rolls back rather than leaving half the roster saved) and one
 * round-trip. Runs via the service role (matches the enrolments pattern, works
 * in mock mode); the caller gates with canManageClass + a roster check first,
 * and RLS still restricts any direct write to a teacher of the class + enrolment.
 */
export async function markAttendanceMany(rows: ReadonlyArray<AttendanceMark>): Promise<void> {
  if (rows.length === 0) return
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const stamped = rows.map((r) => ({ ...r, updated_at: now }))
  const { error } = await admin
    .from('attendance')
    .upsert(stamped, { onConflict: 'class_id,student_id,session_date' })
  if (error) throw new Error(`attendance.markMany: ${error.message}`)
}
