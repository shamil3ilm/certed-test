/**
 * Attendance domain, split by concern:
 *   queries.ts  reads - one session, a student's history, per-session breakdowns
 *   marking.ts  recording a session and clearing one, both canManageClass-gated
 *
 * Table access lives in src/lib/data/attendance. The status type and the pure
 * summary stay in @/lib/attendance/summary, a server-free module so they can be
 * unit-tested and reused on the client; re-exported here for existing callers.
 */
export { summarizeAttendance } from '@/lib/attendance/summary'
export type { AttendanceStatus, AttendanceSummary } from '@/lib/attendance/summary'

export {
  listAttendanceForClassDate,
  classIdsMarkedOn,
  listAttendanceForStudentPage,
  summarizeAttendanceForStudent,
  listSessionSummariesForClass,
} from './queries'
export type { AttendanceRow, PaginatedAttendance, SessionSummary } from './queries'

export { markAttendance, clearAttendanceSession } from './marking'
export type { MarkAttendanceInput } from './marking'
export type { AttendanceMark } from '@/lib/data/attendance'
