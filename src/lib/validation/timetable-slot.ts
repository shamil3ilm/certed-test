import { z } from 'zod'
import { refineTimeOrder } from '@/lib/validation/time-order'

// "HH:mm" 24-hour wall clock (anchored to org_settings.timezone).
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:mm (24h)')

export const createSlotSchema = z
  .object({
    class_id: z.string().uuid(),
    subject: z.string().min(1).max(200),
    tutor_id: z.string().uuid().optional(),
    day_of_week: z.number().int().min(0).max(6),
    start_time: hhmm,
    end_time: hhmm,
    mode_or_location: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => refineTimeOrder(v, ctx))

export const updateSlotSchema = z
  .object({
    subject: z.string().min(1).max(200),
    tutor_id: z.string().uuid().nullable(),
    day_of_week: z.number().int().min(0).max(6),
    start_time: hhmm,
    end_time: hhmm,
    mode_or_location: z.string().max(200).nullable(),
    active: z.boolean(),
  })
  .partial()
  // Same end-after-start rule as create, applied to the fields the partial carries
  // (shared refineTimeOrder). Without it, a PATCH like { start_time: '10:00',
  // end_time: '09:00' } was caught only by the DB CHECK as a 500-style envelope.
  .superRefine((v, ctx) => refineTimeOrder(v, ctx, { partial: true }))

export type CreateSlotInput = z.infer<typeof createSlotSchema>
export type UpdateSlotInput = z.infer<typeof updateSlotSchema>
export { hhmm }
