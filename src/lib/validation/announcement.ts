import { z } from 'zod'
import { titleField } from '@/lib/validation/fields'

export const createAnnouncementSchema = z.object({
  class_id: z.string().uuid().nullable().optional(), // null/omitted = global
  title: titleField,
  message: z.string().trim().min(1).max(5000),
})
