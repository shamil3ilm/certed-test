import { z } from 'zod'
import { titleField } from '@/lib/validation/fields'
import { linkUrl } from './url'

// Strict ISO-8601 instant (the client sends new Date(...).toISOString()). Rejects
// rollover/non-ISO strings like "2026-02-30" or "June 20 2026" that Date.parse
// would silently accept and shift into the wrong stored due instant.
const isoDate = z.string().datetime()

export const createAssignmentSchema = z.object({
  class_id: z.string().uuid(),
  // Trim before length checks so a whitespace-only title ("   ") collapses to ""
  // and is rejected, matching the edit path (which already trims). Otherwise it
  // passes min(1) and renders an empty heading.
  title: titleField,
  description: z.string().trim().max(5000).optional(),
  due_date: isoDate, // absolute ISO instant (client converts its local input to UTC)
  attachment_drive_link: linkUrl.optional(),
  topic: z.string().trim().max(60).optional(),
  // REQUIRED so every assignment grades out of a total (and forms a percentage on
  // the report card). Positive, not just non-negative: a max of 0 is never
  // meaningful. Capped at the DB column precision numeric(6,2) -> max 9999.99.
  max_marks: z.number().positive().max(9999.99),
  // Hard deadline: when true, submissions close after due_date (enforced in
  // recordSubmission). Optional/absent -> false (always-accept-late, the default).
  enforce_deadline: z.boolean().optional(),
  // The kind of classwork. Absent -> 'assignment' (today's behaviour).
  type: z.enum(['assignment', 'exam', 'quiz', 'test', 'project']).optional(),
  // Whether a student submits online. Absent -> defaulted from type in the service
  // (false for a sat exam/quiz/test, true otherwise).
  expects_submission: z.boolean().optional(),
  // Optional END of a timed window (e.g. a 10:00-12:00 exam); due_date is the start.
  ends_at: isoDate.optional(),
})

/** A tutor's mark + optional feedback on one submission. A null score un-grades it. */
export const gradeSchema = z.object({
  score: z.number().min(0).max(9999.99).nullable(),
  feedback: z.string().max(2000).optional(),
})
