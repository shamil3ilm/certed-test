import { z } from 'zod'
import { isCalendarDate } from '@/lib/time/format'

const attendanceStatus = z.enum(['present', 'absent', 'late'])

// isCalendarDate rejects roll-over dates (2026-02-30) that a format regex would
// pass through to the Postgres `date` column as a 500.
const dateOnly = z.string().refine(isCalendarDate, 'invalid date')

/** One student's status for a class on a given session date. */
export const attendanceMarkSchema = z.object({
  class_id: z.string().uuid(),
  student_id: z.string().uuid(),
  session_date: dateOnly,
  status: attendanceStatus,
})
