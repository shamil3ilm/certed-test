export type AttendanceStatus = 'present' | 'absent' | 'late'

export type AttendanceSummary = { present: number; late: number; absent: number; total: number; rate: number }

/**
 * Counts + an attendance rate. Late still counts as attended (they showed up),
 * so the rate is (present + late) / total. Pure - shared by the student view,
 * the report card, and its unit tests.
 */
export function summarizeAttendance(rows: ReadonlyArray<{ status: AttendanceStatus }>): AttendanceSummary {
  const present = rows.filter((r) => r.status === 'present').length
  const late = rows.filter((r) => r.status === 'late').length
  const absent = rows.filter((r) => r.status === 'absent').length
  const total = rows.length
  const rate = total === 0 ? 0 : Math.round(((present + late) / total) * 100)
  return { present, late, absent, total, rate }
}
