import { z } from 'zod'
import { hhmm } from '@/lib/validation/timetableSlot'

// "YYYY-MM-DD" calendar date (interpreted as a wall-clock date in org_settings.timezone).
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')

export const calendarEventKind = z.enum(['event', 'holiday', 'cancellation', 'reschedule'])

export const createEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    event_date: isoDate,
    start_time: hhmm.optional(),
    end_time: hhmm.optional(),
    class_id: z.string().uuid().nullable().optional(),
    kind: calendarEventKind,
    slot_id: z.string().uuid().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.end_time != null && v.start_time == null) {
      ctx.addIssue({ code: 'custom', message: 'end_time requires a start_time', path: ['start_time'] })
    }
    if (v.start_time != null && v.end_time != null && v.end_time <= v.start_time) {
      ctx.addIssue({ code: 'custom', message: 'end_time must be after start_time', path: ['end_time'] })
    }
  })

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).nullable(),
    event_date: isoDate,
    start_time: hhmm.nullable(),
    end_time: hhmm.nullable(),
    class_id: z.string().uuid().nullable(),
    kind: calendarEventKind,
    slot_id: z.string().uuid().nullable(),
  })
  .partial()

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
