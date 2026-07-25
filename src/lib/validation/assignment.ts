import { z } from 'zod'
import { linkUrl } from './url'

// Strict ISO-8601 instant (the client sends new Date(...).toISOString()). Rejects
// rollover/non-ISO strings like "2026-02-30" or "June 20 2026" that Date.parse
// would silently accept and shift into the wrong stored due instant.
const isoDate = z.string().datetime()

export const createAssignmentSchema = z.object({
  class_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  due_date: isoDate, // absolute ISO instant (client converts its local input to UTC)
  attachment_drive_link: linkUrl.optional(),
  topic: z.string().max(60).optional(),
  // Capped at the DB column precision numeric(6,2) -> max 9999.99, so an oversized
  // value is rejected with a clear message instead of a Postgres overflow.
  max_marks: z.number().nonnegative().max(9999.99).optional(),
})

/** A tutor's mark + optional feedback on one submission. A null score un-grades it. */
export const gradeSchema = z.object({
  score: z.number().min(0).max(9999.99).nullable(),
  feedback: z.string().max(2000).optional(),
})
