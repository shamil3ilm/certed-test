import type { Profile } from '@/lib/auth/profile'
import {
  deleteEventRow,
  insertEvent,
  selectEventById,
  selectEvents,
  updateEventRow,
  type CalendarEventKind,
  type CalendarEventRow,
} from '@/lib/data/calendar-events'
import {
  createEventSchema,
  updateEventSchema,
  type CreateEventInput,
  type UpdateEventInput,
} from '@/lib/validation/calendar-event'
import { canWriteClass } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError, RateLimitError } from '@/lib/errors'
import { rateLimit } from '@/lib/security/rate-limit'
import { z } from 'zod'

/** Per-user throttle across the calendar-write API surface (create/update/delete),
 *  applied at the API boundary so a misbehaving client can't spam writes. */
function assertCalendarWriteRate(actorId: string): void {
  if (!rateLimit(`calendar-write:${actorId}`, { limit: 60, windowMs: 60_000 }).ok) {
    throw new RateLimitError('Too many calendar changes in a short time. Please wait a moment.')
  }
}

export type { CalendarEventKind }
export type CalendarEvent = CalendarEventRow

const eventIdSchema = z.string().uuid()

export function validateCreateEventInput(input: unknown): CreateEventInput {
  const parsed = createEventSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'invalid')
  }
  return parsed.data
}

export function validateUpdateEventInput(input: unknown): UpdateEventInput {
  const parsed = updateEventSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'invalid')
  }
  return parsed.data
}

export function validateEventId(input: unknown): string {
  const parsed = eventIdSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Invalid event id')
  }
  return parsed.data
}

// RLS scopes the rows: global events + enrolled/taught course events / admin sees all.
export async function listEvents(opts: { from?: string; to?: string; limit?: number } = {}): Promise<CalendarEvent[]> {
  return selectEvents(opts)
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  return selectEventById(id)
}

/**
 * Global events (class_id null) are admin-only; tutors may only create
 * course events they teach - canWriteClass covers exactly this rule.
 */
export async function createEvent(actor: Profile, input: CreateEventInput): Promise<CalendarEvent> {
  if (!(await canWriteClass(actor, input.class_id ?? null))) {
    throw new PermissionError('Not authorized to create this event.')
  }
  const created = await insertEvent({
    title: input.title,
    description: input.description ?? null,
    event_date: input.event_date,
    start_time: input.start_time ?? null,
    end_time: input.end_time ?? null,
    class_id: input.class_id ?? null,
    kind: input.kind,
    slot_id: input.slot_id ?? null,
    created_by: actor.id,
  })
  await auditPrivilegedAction(actor, 'event.create', 'calendar_event', created.id)
  return created
}

export async function createEventFromApiInput(actor: Profile, input: unknown): Promise<CalendarEvent> {
  assertCalendarWriteRate(actor.id)
  return createEvent(actor, validateCreateEventInput(input))
}

/**
 * Defense-in-depth: if the caller is MOVING the event, re-authorize the
 * DESTINATION class too - not just the class it currently belongs to. RLS
 * also blocks this, but don't let a tutor reassign an event to a class
 * they don't teach (or to a global/null event) if the RLS policy is ever
 * loosened.
 */
export async function updateEvent(actor: Profile, id: string, patch: UpdateEventInput): Promise<CalendarEvent> {
  const existing = await getEvent(id)
  if (!existing) throw new NotFoundError('Event not found')
  if (!(await canWriteClass(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this event.')
  }
  const moved = patch.class_id !== undefined && patch.class_id !== existing.class_id
  if (patch.class_id !== undefined && moved && !(await canWriteClass(actor, patch.class_id))) {
    throw new PermissionError('Not authorized to move this event to that class.')
  }
  const updated = await updateEventRow(id, patch)
  await auditPrivilegedAction(actor, moved ? 'event.move' : 'event.update', 'calendar_event', id)
  return updated
}

export async function updateEventFromApiInput(actor: Profile, id: unknown, input: unknown): Promise<CalendarEvent> {
  assertCalendarWriteRate(actor.id)
  return updateEvent(actor, validateEventId(id), validateUpdateEventInput(input))
}

export async function deleteEvent(actor: Profile, id: string): Promise<void> {
  const existing = await getEvent(id)
  if (!existing) throw new NotFoundError('Event not found')
  if (!(await canWriteClass(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this event.')
  }
  await deleteEventRow(id)
  await auditPrivilegedAction(actor, 'event.delete', 'calendar_event', id)
}

export async function deleteEventFromApiInput(actor: Profile, id: unknown): Promise<void> {
  assertCalendarWriteRate(actor.id)
  await deleteEvent(actor, validateEventId(id))
}
