import { z } from 'zod'

export const attendanceStatus = z.enum(['present', 'absent', 'late'])

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid date')

/** One student's status for a class on a given session date. */
export const attendanceMarkSchema = z.object({
  class_id: z.string().uuid(),
  student_id: z.string().uuid(),
  session_date: dateOnly,
  status: attendanceStatus,
})
