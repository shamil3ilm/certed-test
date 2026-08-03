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
import { parseOrThrow } from '@/lib/validation/parse'
import { assertTimeOrder } from '@/lib/validation/time-order'
import { canWriteClass, assertClassActive } from '@/lib/permission'
import { selectSlotById } from '@/lib/data/timetable-slots'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { throttleWrite } from '@/lib/security/throttle'
import { z } from 'zod'

export type { CalendarEventKind }
export type CalendarEvent = CalendarEventRow

const eventIdSchema = z.string().uuid()

export function validateCreateEventInput(input: unknown): CreateEventInput {
  return parseOrThrow(createEventSchema, input)
}

export function validateUpdateEventInput(input: unknown): UpdateEventInput {
  return parseOrThrow(updateEventSchema, input)
}

export function validateEventId(input: unknown): string {
  return parseOrThrow(eventIdSchema, input, 'Invalid event id')
}

// RLS scopes the rows: global events + enrolled/taught course events / admin sees all.
export async function listEvents(opts: { from?: string; to?: string; limit?: number } = {}): Promise<CalendarEvent[]> {
  return selectEvents(opts)
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  return selectEventById(id)
}

/**
 * A slot_id on an event must reference a timetable slot IN THE EVENT'S OWN CLASS.
 * Otherwise a cancellation/reschedule event - which suppresses its slot on the
 * merged calendar - could hide an UNRELATED class's slot from anyone who can see
 * both. A global event (no class) can reference no slot, since slots belong to
 * classes. The slot read is RLS-scoped, so a slot the caller cannot even see is
 * also correctly rejected.
 */
async function assertSlotInClass(slotId: string, classId: string | null): Promise<void> {
  if (classId == null) {
    throw new ValidationError('A global event cannot reference a class timetable slot.')
  }
  const slot = await selectSlotById(slotId)
  if (!slot || slot.class_id !== classId) {
    throw new ValidationError("slot_id must reference a timetable slot in this event's class.")
  }
}

/**
 * Global events (class_id null) are admin-only; tutors may only create
 * course events they teach - canWriteClass covers exactly this rule.
 */
export async function createEvent(actor: Profile, input: CreateEventInput): Promise<CalendarEvent> {
  if (!(await canWriteClass(actor, input.class_id ?? null))) {
    throw new PermissionError('Not authorized to create this event.')
  }
  if (input.slot_id) await assertSlotInClass(input.slot_id, input.class_id ?? null)
  if (input.class_id) await assertClassActive(input.class_id)
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
  // A cancellation/reschedule changes when a class meets - tell its students
  // (best-effort). Plain events + holidays don't fan out.
  if (created.class_id && (created.kind === 'cancellation' || created.kind === 'reschedule')) {
    await notifyClassRoleBestEffort(created.class_id, 'students', {
      kind: 'schedule',
      title: `Class ${created.kind === 'cancellation' ? 'cancelled' : 'rescheduled'}: ${created.title}`,
      body: created.event_date,
      link: '/calendar',
    })
  }
  return created
}

export async function createEventFromApiInput(actor: Profile, input: unknown): Promise<CalendarEvent> {
  throttleWrite('calendar', actor.id, 'calendar')
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
  // Moving an event INTO a class must respect the archived-class rule, exactly like
  // creating one there - a move must not place content onto a hidden class. (A move
  // to a global/null event has no class to check; editing an event that STAYS put
  // is allowed, matching the app's create-only archived guard.)
  if (moved && patch.class_id) await assertClassActive(patch.class_id)
  // Keep any slot reference within the event's own class. Re-check when either the
  // slot or the class changes - moving an event must not leave it pointing at the
  // source class's slot.
  const slotChanged = patch.slot_id !== undefined && patch.slot_id !== existing.slot_id
  if (slotChanged || moved) {
    const effSlot = patch.slot_id !== undefined ? patch.slot_id : existing.slot_id
    const effClass = patch.class_id !== undefined ? patch.class_id : existing.class_id
    if (effSlot) await assertSlotInClass(effSlot, effClass)
  }
  // calendar_events has NO DB time-order CHECK, and a partial patch can carry just
  // one of start/end - which the schema can't validate against the stored row.
  // Validate the EFFECTIVE (merged) pair so a crafted { end_time } that inverts
  // the interval is rejected, not silently persisted as a negative-duration event.
  assertTimeOrder(
    patch.start_time !== undefined ? patch.start_time : existing.start_time,
    patch.end_time !== undefined ? patch.end_time : existing.end_time,
  )
  const updated = await updateEventRow(id, patch)
  await auditPrivilegedAction(actor, moved ? 'event.move' : 'event.update', 'calendar_event', id)
  return updated
}

export async function updateEventFromApiInput(actor: Profile, id: unknown, input: unknown): Promise<CalendarEvent> {
  throttleWrite('calendar', actor.id, 'calendar')
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
  throttleWrite('calendar', actor.id, 'calendar')
  await deleteEvent(actor, validateEventId(id))
}
