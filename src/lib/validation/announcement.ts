import { z } from 'zod'

export const createAnnouncementSchema = z.object({
  course_id: z.string().uuid().nullable().optional(), // null/omitted = global
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
})
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>

export const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(5000).optional(),
  status: z.enum(['active', 'archived']).optional(),
})
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>
