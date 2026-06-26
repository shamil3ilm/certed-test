import { z } from 'zod'

// "HH:mm" 24-hour wall clock (anchored to org_settings.timezone).
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:mm (24h)')

export const createSlotSchema = z
  .object({
    course_id: z.string().uuid(),
    subject: z.string().min(1).max(200),
    teacher_id: z.string().uuid().optional(),
    day_of_week: z.number().int().min(0).max(6),
    start_time: hhmm,
    end_time: hhmm,
    mode_or_location: z.string().max(200).optional(),
  })
  .refine((v) => v.end_time > v.start_time, {
    message: 'end_time must be after start_time',
    path: ['end_time'],
  })

export const updateSlotSchema = z
  .object({
    subject: z.string().min(1).max(200),
    teacher_id: z.string().uuid().nullable(),
    day_of_week: z.number().int().min(0).max(6),
    start_time: hhmm,
    end_time: hhmm,
    mode_or_location: z.string().max(200).nullable(),
    active: z.boolean(),
  })
  .partial()

export type CreateSlotInput = z.infer<typeof createSlotSchema>
export type UpdateSlotInput = z.infer<typeof updateSlotSchema>
export { hhmm }
