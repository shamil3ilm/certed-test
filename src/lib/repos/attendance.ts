import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AttendanceStatus = 'present' | 'absent' | 'late'

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

/**
 * Upserts one student's status for a class + session date. Runs via the service
 * role (matches the enrolments pattern and works in mock mode); callers gate with
 * canManageClass first, and RLS still restricts any direct write to a teacher of
 * the class.
 */
export async function markAttendance(input: {
  class_id: string
  student_id: string
  session_date: string
  status: AttendanceStatus
  marked_by: string
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('attendance')
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: 'class_id,student_id,session_date' })
  if (error) throw new Error(`attendance.mark: ${error.message}`)
}

export type AttendanceSummary = { present: number; late: number; absent: number; total: number; rate: number }

/** Counts + an attendance rate (late still counts as attended). Pure, so the
 *  report card and the student view can share it. */
export function summarizeAttendance(rows: ReadonlyArray<{ status: AttendanceStatus }>): AttendanceSummary {
  const present = rows.filter((r) => r.status === 'present').length
  const late = rows.filter((r) => r.status === 'late').length
  const absent = rows.filter((r) => r.status === 'absent').length
  const total = rows.length
  const rate = total === 0 ? 0 : Math.round(((present + late) / total) * 100)
  return { present, late, absent, total, rate }
}
