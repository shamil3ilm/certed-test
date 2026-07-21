import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { getClassMembers } from '@/lib/services/classes'
import { attendanceMarkSchema } from '@/lib/validation/attendance'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError } from '@/lib/errors'

// The status type + the pure summary live in a server-free module so they can be
// unit-tested and reused on the client; re-exported here for existing callers.
export { summarizeAttendance } from '@/lib/attendance/summary'
export type { AttendanceStatus, AttendanceSummary } from '@/lib/attendance/summary'
import { summarizeAttendance, type AttendanceStatus, type AttendanceSummary } from '@/lib/attendance/summary'

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

export type PaginatedAttendance = { items: AttendanceRow[]; total: number }

/** Paginated read of a student's own attendance history (SQL-side range + count),
 *  so the record page loads one bounded page rather than every row. */
export async function listAttendanceForStudentPage(
  studentId: string,
  opts: { page: number; pageSize: number; classId?: string },
): Promise<PaginatedAttendance> {
  const supabase = await createClient()
  const from = (opts.page - 1) * opts.pageSize
  const to = from + opts.pageSize - 1
  let query = supabase
    .from('attendance')
    .select('*', { count: 'exact' })
    .eq('student_id', studentId)
    .order('session_date', { ascending: false })
  if (opts.classId) query = query.eq('class_id', opts.classId)
  const { data, error, count } = await query.range(from, to)
  if (error) throw new Error(`attendance.listForStudentPage: ${error.message}`)
  return { items: (data ?? []) as AttendanceRow[], total: count ?? 0 }
}

/** SQL-side present/late/absent/rate for a student - head-only counts (zero
 *  row transfer), so the summary card doesn't require fetching every row
 *  just to compute a percentage (the dashboard widget previously did). */
export async function summarizeAttendanceForStudent(studentId: string, classId?: string): Promise<AttendanceSummary> {
  const supabase = await createClient()
  const countFor = (status?: AttendanceStatus) => {
    let q = supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', studentId)
    if (classId) q = q.eq('class_id', classId)
    if (status) q = q.eq('status', status)
    return q
  }
  const [presentRes, lateRes, absentRes, totalRes] = await Promise.all([
    countFor('present'),
    countFor('late'),
    countFor('absent'),
    countFor(),
  ])
  for (const r of [presentRes, lateRes, absentRes, totalRes]) {
    if (r.error) throw new Error(`attendance.summarizeForStudent: ${r.error.message}`)
  }
  const present = presentRes.count ?? 0
  const late = lateRes.count ?? 0
  const absent = absentRes.count ?? 0
  const total = totalRes.count ?? 0
  const rate = total === 0 ? 0 : Math.round(((present + late) / total) * 100)
  return { present, late, absent, total, rate }
}

export type SessionSummary = AttendanceSummary & { session_date: string }

/**
 * Every session date a class has attendance for, newest first, each with its
 * present/late/absent breakdown - the tutor/admin "attendance history"
 * view (the single-date `?date=` picker on the attendance page has no way to
 * browse past dates otherwise). Bounded to the last 2000 marks (~years of
 * daily sessions) before grouping, then to `limit` distinct dates.
 */
export async function listSessionSummariesForClass(classId: string, limit = 30): Promise<SessionSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('class_id', classId)
    .order('session_date', { ascending: false })
    .limit(2000)
  if (error) throw new Error(`attendance.listSessionSummaries: ${error.message}`)
  const byDate = new Map<string, AttendanceRow[]>()
  for (const r of (data ?? []) as AttendanceRow[]) {
    const arr = byDate.get(r.session_date) ?? []
    arr.push(r)
    byDate.set(r.session_date, arr)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, limit)
    .map(([session_date, marks]) => ({ session_date, ...summarizeAttendance(marks) }))
}

export type AttendanceMark = {
  class_id: string
  student_id: string
  session_date: string
  status: AttendanceStatus
  marked_by: string
}

/**
 * Upserts a whole class's marks for a session date in ONE call - atomic (a
 * partial failure rolls back rather than leaving half the roster saved) and
 * one round-trip. Runs via the service role (matches the enrolments
 * pattern, works in mock mode); RLS still restricts any direct write to a
 * tutor of the class + enrolment.
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
 * by canManageClass (a tutor of THIS class or an admin) and - critically -
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
  if (rows.length === 0) throw new ValidationError('Nothing to save - check the date and roster.')

  await markAttendanceMany(rows)
  await auditPrivilegedAction(actor, 'attendance.mark', 'class', params.classId)
  return { saved: rows.length }
}

/**
 * Clears (deletes) every mark for a class on one session date - the correction
 * path for a session recorded in error or on the wrong date. Marking only ever
 * upserts present/late/absent, so without this a mistaken session could be
 * re-marked but never removed. Gated by canManageClass and audited.
 */
export async function clearAttendanceSession(
  actor: Profile,
  classId: string,
  sessionDate: string,
): Promise<{ cleared: number }> {
  if (!(await canManageClass(actor, classId))) {
    throw new PermissionError('Not allowed to mark attendance for this class.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    throw new ValidationError('Invalid session date.')
  }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('attendance')
    .delete()
    .eq('class_id', classId)
    .eq('session_date', sessionDate)
    .select('id')
  if (error) throw new Error(`attendance.clearSession: ${error.message}`)
  await auditPrivilegedAction(actor, 'attendance.clear', 'class', classId)
  return { cleared: (data ?? []).length }
}
