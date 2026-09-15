export type AttendanceStatus = 'present' | 'absent' | 'late'

export type AttendanceSummary = { present: number; late: number; absent: number; total: number; rate: number }

/**
 * The attendance rate, as a whole percent. Late still counts as attended (they showed up),
 * so the rate is (present + late) / total; no marks at all is 0, not NaN. The one definition,
 * whether the counts came from rows in memory or from SQL.
 */
export function attendanceRate(present: number, late: number, total: number): number {
  return total === 0 ? 0 : Math.round(((present + late) / total) * 100)
}

/** Counts + an attendance rate. Pure - shared by the student view, the report card, and its
 *  unit tests. */
export function summarizeAttendance(rows: ReadonlyArray<{ status: AttendanceStatus }>): AttendanceSummary {
  const present = rows.filter((r) => r.status === 'present').length
  const late = rows.filter((r) => r.status === 'late').length
  const absent = rows.filter((r) => r.status === 'absent').length
  const total = rows.length
  return { present, late, absent, total, rate: attendanceRate(present, late, total) }
}
