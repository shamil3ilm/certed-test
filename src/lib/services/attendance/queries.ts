import 'server-only'
import { summarizeAttendance, type AttendanceSummary } from '@/lib/attendance/summary'
import {
  countStatusesForStudent,
  selectForClassDate,
  selectMarkedClassIds,
  selectRecentForClass,
  selectStudentPage,
  type AttendanceRow,
} from '@/lib/data/attendance'

/** Reading attendance: one session, a student's history, and the per-session
 *  breakdowns. Table access is in src/lib/data/attendance. */

export type { AttendanceRow }
export type PaginatedAttendance = { items: AttendanceRow[]; total: number }
export type SessionSummary = AttendanceSummary & { session_date: string }

/** Every student's mark for one class on one session date. */
export async function listAttendanceForClassDate(classId: string, date: string): Promise<AttendanceRow[]> {
  return selectForClassDate(classId, date)
}

/** Which of `classIds` already have ANY attendance recorded on `date` - the
 *  tutor dashboard's pending-attendance widget. */
export async function classIdsMarkedOn(classIds: string[], date: string): Promise<Set<string>> {
  return new Set(await selectMarkedClassIds(classIds, date))
}

/** Paginated read of a student's own attendance history, so the record page
 *  loads one bounded page rather than every row. */
export async function listAttendanceForStudentPage(
  studentId: string,
  opts: { page: number; pageSize: number; classId?: string },
): Promise<PaginatedAttendance> {
  const from = (opts.page - 1) * opts.pageSize
  const { rows, total } = await selectStudentPage(studentId, {
    from,
    to: from + opts.pageSize - 1,
    classId: opts.classId,
  })
  return { items: rows, total }
}

/** Present/late/absent/rate for a student, counted SQL-side. */
export async function summarizeAttendanceForStudent(studentId: string, classId?: string): Promise<AttendanceSummary> {
  const { present, late, absent, total } = await countStatusesForStudent(studentId, classId)
  const rate = total === 0 ? 0 : Math.round(((present + late) / total) * 100)
  return { present, late, absent, total, rate }
}

/**
 * Every session date a class has attendance for, newest first, each with its
 * present/late/absent breakdown - the tutor/admin "attendance history" view
 * (the single-date `?date=` picker on the attendance page has no way to browse
 * past dates otherwise). Bounded to the last 2000 marks before grouping, then
 * to `limit` distinct dates.
 */
export async function listSessionSummariesForClass(classId: string, limit = 30): Promise<SessionSummary[]> {
  const marks = await selectRecentForClass(classId)
  const byDate = new Map<string, AttendanceRow[]>()
  for (const r of marks) {
    byDate.set(r.session_date, [...(byDate.get(r.session_date) ?? []), r])
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, limit)
    .map(([session_date, dateMarks]) => ({ session_date, ...summarizeAttendance(dateMarks) }))
}
