/**
 * Attendance time calculations. Pure and server-free: given a
 * session's timing record and a student's join/leave, derive every duration the
 * UI and summaries need. Times are ISO strings (or null when not recorded);
 * every result is whole MINUTES (formatters below turn them into "1h 30m").
 *
 * Shared by the attendance page, the summaries, and its unit tests - no IO here.
 */

export type SessionTimes = {
  scheduled_start: string | null
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
  tutor_join_at: string | null
  tutor_leave_at: string | null
}

export type StudentTimes = {
  join_at: string | null
  leave_at: string | null
}

/** Whole minutes from `a` to `b`, clamped at 0, or null if either is missing or
 *  unparseable. */
export function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  const start = Date.parse(a)
  const end = Date.parse(b)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.max(0, Math.round((end - start) / 60000))
}

/** Minutes `later` runs past `earlier` (0 if not later / either missing). Used
 *  for late-join (join past scheduled start) and early-leave (leave before
 *  scheduled end). */
function overshootMinutes(earlier: string | null, later: string | null): number | null {
  if (!earlier || !later) return null
  const a = Date.parse(earlier)
  const b = Date.parse(later)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.max(0, Math.round((b - a) / 60000))
}

export type SessionMetrics = {
  scheduledMinutes: number | null
  /** Actual window if recorded, else the scheduled window. */
  sessionMinutes: number | null
  tutorWorkingMinutes: number | null
}

export function sessionMetrics(t: SessionTimes): SessionMetrics {
  const scheduledMinutes = minutesBetween(t.scheduled_start, t.scheduled_end)
  const actualMinutes = minutesBetween(t.actual_start, t.actual_end)
  return {
    scheduledMinutes,
    sessionMinutes: actualMinutes ?? scheduledMinutes,
    tutorWorkingMinutes: minutesBetween(t.tutor_join_at, t.tutor_leave_at),
  }
}

export type StudentMetrics = {
  learningMinutes: number | null
  lateJoinMinutes: number | null
  earlyLeaveMinutes: number | null
  /** Scheduled time the student did not spend learning (late + early + any gap),
   *  clamped at 0. Null when there is no scheduled window to compare against. */
  missedMinutes: number | null
}

export function studentMetrics(session: SessionTimes, student: StudentTimes): StudentMetrics {
  const learningMinutes = minutesBetween(student.join_at, student.leave_at)
  const lateJoinMinutes = overshootMinutes(session.scheduled_start, student.join_at)
  const earlyLeaveMinutes = overshootMinutes(student.leave_at, session.scheduled_end)
  const scheduled = minutesBetween(session.scheduled_start, session.scheduled_end)
  const missedMinutes = scheduled == null ? null : Math.max(0, scheduled - (learningMinutes ?? 0))
  return { learningMinutes, lateJoinMinutes, earlyLeaveMinutes, missedMinutes }
}

/** "1h 30m" / "45m" / "2h" / "-" for a minutes value. */
export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return '-'
  const hours = Math.floor(min / 60)
  const mins = min % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

/** Decimal hours, e.g. "1.5h" / "-", for totals in summaries. */
export function formatHours(min: number | null | undefined): string {
  if (min == null) return '-'
  return `${(min / 60).toFixed(1)}h`
}

/** Sum a list of minute values, treating null as 0; returns null only when the
 *  list is empty (nothing to total). */
export function sumMinutes(values: Array<number | null>): number | null {
  if (values.length === 0) return null
  return values.reduce((total: number, v) => total + (v ?? 0), 0)
}
