import { z } from 'zod'

export const createAnnouncementSchema = z.object({
  class_id: z.string().uuid().nullable().optional(), // null/omitted = global
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
})
