import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { getClassMembers } from '@/lib/services/classes'
import { attendanceMarkSchema } from '@/lib/validation/attendance'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, ValidationError } from '@/lib/errors'

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
 * partial failure rolls back rather than leaving half the roster saved) and
 * one round-trip. Runs via the service role (matches the enrolments
 * pattern, works in mock mode); RLS still restricts any direct write to a
 * teacher of the class + enrolment.
 */
async function markAttendanceMany(rows: ReadonlyArray<AttendanceMark>): Promise<void> {
  if (rows.length === 0) return
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const stamped = rows.map((r) => ({ ...r, updated_at: now }))
  const { error } = await admin
    .from('attendance')
    .upsert(stamped, { onConflict: 'class_id,student_id,session_date' })
  if (error) throw new Error(`attendance.markMany: ${error.message}`)
}

export type MarkAttendanceInput = { student_id: string; status: string }

/**
 * Marks a whole class for one session date in a single atomic write. Gated
 * by canManageClass (a tutor of THIS class or an admin) and — critically —
 * each student_id must be on this class's roster, so a forged
 * status:<foreignId> can't create a cross-class attendance row (which would
 * pollute that student's report card).
 */
export async function markAttendance(
  actor: Profile,
  params: { classId: string; sessionDate: string; marks: MarkAttendanceInput[] },
): Promise<{ saved: number }> {
  if (!(await canManageClass(actor, params.classId))) {
    throw new PermissionError('Not allowed to mark attendance for this class.')
  }
  const { students } = await getClassMembers(params.classId)
  const enrolled = new Set(students.map((s) => s.id))

  const rows: AttendanceMark[] = []
  for (const m of params.marks) {
    if (!enrolled.has(m.student_id)) continue // reject anyone not on this class's roster
    const parsed = attendanceMarkSchema.safeParse({
      class_id: params.classId,
      student_id: m.student_id,
      session_date: params.sessionDate,
      status: m.status,
    })
    if (parsed.success) rows.push({ ...parsed.data, marked_by: actor.id })
  }
  if (rows.length === 0) throw new ValidationError('Nothing to save — check the date and roster.')

  await markAttendanceMany(rows)
  await writeAudit({ actor_id: actor.id, action: 'attendance.mark', entity_type: 'class', entity_id: params.classId })
  return { saved: rows.length }
}
