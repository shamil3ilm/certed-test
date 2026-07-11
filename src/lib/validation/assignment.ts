import { z } from 'zod'
import { linkUrl } from './url'

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid datetime')

export const createAssignmentSchema = z.object({
  class_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  due_date: isoDate, // absolute ISO instant (client converts its local input to UTC)
  attachment_drive_link: linkUrl.optional(),
})
