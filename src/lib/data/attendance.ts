import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AttendanceStatus } from '@/lib/attendance/summary'

/**
 * Table access for `attendance`. No authorization here - the domain
 * (src/lib/services/attendance) gates every write on canManageClass and checks
 * the roster.
 *
 * Reads use the RLS client. The two writes use the service role, matching the
 * enrolments pattern and working in mock mode; RLS still restricts any DIRECT
 * write to a tutor of the class plus enrolment.
 */

export type AttendanceRow = {
  id: string
  class_id: string
  student_id: string
  session_date: string // 'YYYY-MM-DD'
  status: AttendanceStatus
  join_at: string | null
  leave_at: string | null
  marked_by: string | null
  created_at: string
  updated_at: string
}

export type AttendanceMark = {
  class_id: string
  student_id: string
  session_date: string
  status: AttendanceStatus
  join_at?: string | null
  leave_at?: string | null
  marked_by: string
}

// Explicit projection so a future wide column on `attendance` isn't shipped on
// every list read.
const ATTENDANCE_COLUMNS =
  'id, class_id, student_id, session_date, status, join_at, leave_at, marked_by, created_at, updated_at'

type StatusCounts = { present: number; late: number; absent: number; total: number }

/** Every student's mark for one class on one session date. */
export async function selectForClassDate(classId: string, date: string): Promise<AttendanceRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attendance')
    .select(ATTENDANCE_COLUMNS)
    .eq('class_id', classId)
    .eq('session_date', date)
  if (error) throw new Error(`attendance.listForClassDate: ${error.message}`)
  return (data ?? []) as AttendanceRow[]
}

/** Filterable, date-wise attendance history for a class (newest first). Powers
 *  the Attendance Details view - status + date-range filters run SQL-side. */
export async function selectHistoryForClass(
  classId: string,
  opts: { status?: AttendanceStatus; from?: string; to?: string; limit?: number },
): Promise<AttendanceRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('attendance')
    .select(ATTENDANCE_COLUMNS)
    .eq('class_id', classId)
    .order('session_date', { ascending: false })
  if (opts.status) query = query.eq('status', opts.status)
  if (opts.from) query = query.gte('session_date', opts.from)
  if (opts.to) query = query.lte('session_date', opts.to)
  const { data, error } = await query.limit(opts.limit ?? 200)
  if (error) throw new Error(`attendance.historyForClass: ${error.message}`)
  return (data ?? []) as AttendanceRow[]
}

/** Which of `classIds` already have ANY mark on `date` - one query instead of
 *  one-per-class (the tutor dashboard's pending-attendance widget). */
export async function selectMarkedClassIds(classIds: string[], date: string): Promise<string[]> {
  if (classIds.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attendance')
    .select('class_id')
    .in('class_id', classIds)
    .eq('session_date', date)
  if (error) throw new Error(`attendance.classIdsMarkedOn: ${error.message}`)
  return ((data ?? []) as { class_id: string }[]).map((r) => r.class_id)
}

/** One bounded page of a student's history, newest first, with an exact total -
 *  the range and the count are both SQL-side. */
export async function selectStudentPage(
  studentId: string,
  opts: { from: number; to: number; classId?: string },
): Promise<{ rows: AttendanceRow[]; total: number }> {
  const supabase = await createClient()
  let query = supabase
    .from('attendance')
    .select(ATTENDANCE_COLUMNS, { count: 'exact' })
    .eq('student_id', studentId)
    .order('session_date', { ascending: false })
  if (opts.classId) query = query.eq('class_id', opts.classId)
  const { data, error, count } = await query.range(opts.from, opts.to)
  if (error) throw new Error(`attendance.listForStudentPage: ${error.message}`)
  return { rows: (data ?? []) as AttendanceRow[], total: count ?? 0 }
}

/** Present/late/absent/total for a student as head-only counts - zero rows
 *  transfer, so a summary card never has to fetch every mark to show a
 *  percentage. */
export async function countStatusesForStudent(studentId: string, classId?: string): Promise<StatusCounts> {
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
  return {
    present: presentRes.count ?? 0,
    late: lateRes.count ?? 0,
    absent: absentRes.count ?? 0,
    total: totalRes.count ?? 0,
  }
}

/** Row cap on the marks pulled for session-summary grouping. Roughly years of
 *  daily sessions; exported so the caller can tell when a result was truncated. */
export const RECENT_CLASS_MARKS_CAP = 2000

/** Recent marks for a class, newest first, bounded before the caller groups
 *  them by date. 2000 marks is roughly years of daily sessions. */
export async function selectRecentForClass(classId: string, limit = RECENT_CLASS_MARKS_CAP): Promise<AttendanceRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attendance')
    .select(ATTENDANCE_COLUMNS)
    .eq('class_id', classId)
    .order('session_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`attendance.listSessionSummaries: ${error.message}`)
  return (data ?? []) as AttendanceRow[]
}

/**
 * Upserts a whole class's marks for a session date in ONE call - atomic (a
 * partial failure rolls back rather than leaving half the roster saved) and one
 * round-trip.
 */
export async function upsertMarks(rows: ReadonlyArray<AttendanceMark>): Promise<void> {
  if (rows.length === 0) return
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const stamped = rows.map((r) => ({ ...r, updated_at: now }))
  const { error } = await admin.from('attendance').upsert(stamped, { onConflict: 'class_id,student_id,session_date' })
  if (error) throw new Error(`attendance.markMany: ${error.message}`)
}

/** Deletes every mark for a class on one session date, returning how many went. */
export async function deleteSession(classId: string, sessionDate: string): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('attendance')
    .delete()
    .eq('class_id', classId)
    .eq('session_date', sessionDate)
    .select('id')
  if (error) throw new Error(`attendance.clearSession: ${error.message}`)
  return (data ?? []).length
}

/** Every attendance status for one student, SERVICE-ROLE, for the report card's
 *  summary. Same reasoning and same fail-loud contract as
 *  selectScoresForStudentAsService. */
export async function selectStatusesForStudentAsService(studentId: string): Promise<{ status: AttendanceStatus }[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('attendance').select('status').eq('student_id', studentId)
  if (error) throw new Error(`reportCard.att: ${error.message}`)
  return (data ?? []) as { status: AttendanceStatus }[]
}

/** Full attendance history for one student, SERVICE-ROLE, for mentor/admin
 *  evaluation views. The caller must already have proved oversight access. */
export async function selectRowsForStudentAsService(
  studentId: string,
  classId?: string,
): Promise<Pick<AttendanceRow, 'class_id' | 'session_date' | 'status'>[]> {
  const admin = createAdminClient()
  let query = admin
    .from('attendance')
    .select('class_id, session_date, status')
    .eq('student_id', studentId)
    .order('session_date', { ascending: false })
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw new Error(`menteeOverview.attendance: ${error.message}`)
  return (data ?? []) as Pick<AttendanceRow, 'class_id' | 'session_date' | 'status'>[]
}

/** Attendance rows for a SET of students (keeping `student_id`), so the mentor
 *  dashboard reads its whole cohort's attendance in one query. */
export async function selectRowsForStudentsAsService(
  studentIds: string[],
): Promise<(Pick<AttendanceRow, 'class_id' | 'session_date' | 'status'> & { student_id: string })[]> {
  if (studentIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('attendance')
    .select('student_id, class_id, session_date, status')
    .in('student_id', studentIds)
    .order('session_date', { ascending: false })
  if (error) throw new Error(`menteeOverview.attendanceBatch: ${error.message}`)
  return (data ?? []) as (Pick<AttendanceRow, 'class_id' | 'session_date' | 'status'> & { student_id: string })[]
}
