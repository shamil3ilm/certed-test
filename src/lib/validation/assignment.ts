import { z } from 'zod'
import { linkUrl } from './url'

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid datetime')

export const createAssignmentSchema = z.object({
  class_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  due_date: isoDate, // absolute ISO instant (client converts its local input to UTC)
  attachment_drive_link: linkUrl.optional(),
  topic: z.string().max(60).optional(),
  max_marks: z.number().nonnegative().max(100000).optional(),
})

/** A tutor's mark + optional feedback on one submission. A null score un-grades it. */
export const gradeSchema = z.object({
  score: z.number().min(0).max(100000).nullable(),
  feedback: z.string().max(2000).optional(),
})
