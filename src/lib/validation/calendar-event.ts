import { z } from 'zod'
import { hhmm } from '@/lib/validation/timetable-slot'
import { refineTimeOrder } from '@/lib/validation/time-order'
import { isCalendarDate } from '@/lib/time/format'

// "YYYY-MM-DD" calendar date (interpreted as a wall-clock date in org_settings.timezone).
// isCalendarDate also rejects roll-over dates (2026-02-30, 2026-13-45) that a bare
// format regex would let through to the Postgres `date` column as a 500.
const isoDate = z.string().refine(isCalendarDate, 'must be a valid YYYY-MM-DD date')

const calendarEventKind = z.enum(['event', 'holiday', 'cancellation', 'reschedule'])

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
  // A timed event needs both a start and an end, in order (shared refineTimeOrder).
  .superRefine((v, ctx) => refineTimeOrder(v, ctx, { endRequiresStart: true }))

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
  // Same time invariants as create, for the fields a partial patch carries
  // (shared refineTimeOrder, partial mode). calendar_events has NO DB time-order
  // CHECK (unlike timetable_slots, 0004) and both time columns are nullable, so
  // without this an inverted patch ({start:"10:00", end:"09:00"}) or one that
  // clears start while setting end is silently persisted and corrupts the calendar.
  .superRefine((v, ctx) => refineTimeOrder(v, ctx, { endRequiresStart: true, partial: true }))

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
