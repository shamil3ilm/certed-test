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
import { canWriteCalendar, canWriteClass, assertClassActive } from '@/lib/permission'
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
export async function listEvents(
  opts: { from?: string; to?: string; limit?: number; kind?: CalendarEventKind } = {},
): Promise<CalendarEvent[]> {
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

const EVENT_NOTICE: Record<CalendarEvent['kind'], { added: string; changed: string; removed: string }> = {
  cancellation: { added: 'Class cancelled', changed: 'Cancellation changed', removed: 'Cancellation lifted' },
  reschedule: { added: 'Class rescheduled', changed: 'Reschedule changed', removed: 'Reschedule lifted' },
  holiday: { added: 'New holiday', changed: 'Holiday changed', removed: 'Holiday removed' },
  event: { added: 'New event', changed: 'Event changed', removed: 'Event removed' },
  exam: { added: 'New exam', changed: 'Exam changed', removed: 'Exam removed' },
}

/**
 * Tell a class - its students, its tutors and the mentors of its students - that its calendar
 * changed, everyone but whoever changed it. A class's calendar is what people plan their week
 * around, so a date that moves or a session that is called off without a word is someone turning
 * up to nothing. Academy-wide events (no class) are deliberately NOT fanned out - they would
 * notify every account. Best-effort: the event is already written.
 */
async function notifyClassOfEvent(
  event: CalendarEvent,
  change: 'added' | 'changed' | 'removed',
  actorId: string,
): Promise<void> {
  if (!event.class_id) return
  await notifyClassRoleBestEffort(
    event.class_id,
    ['students', 'tutors', 'mentors'],
    {
      kind: 'schedule',
      title: `${EVENT_NOTICE[event.kind][change]}: ${event.title}`,
      body: event.event_date,
      link: '/calendar',
    },
    actorId,
  )
}

/** The patch without its undefined keys, so spreading it over a row never blanks a field. */
function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** Whether an edit changed anything a person plans around: when, what it is called, or what it is. */
function changesThePlan(before: CalendarEvent, after: CalendarEvent): boolean {
  return (
    before.title !== after.title ||
    before.event_date !== after.event_date ||
    before.start_time !== after.start_time ||
    before.end_time !== after.end_time ||
    before.kind !== after.kind ||
    before.class_id !== after.class_id
  )
}

/**
 * Global events (class_id null) are admin-only; a tutor may create events for a class
 * they teach, and a mentor for a class their mentee is enrolled in - canWriteCalendar
 * covers exactly this rule (and agrees with the calendar_events_write RLS scope).
 */
export async function createEvent(actor: Profile, input: CreateEventInput): Promise<CalendarEvent> {
  if (!(await canWriteCalendar(actor, input.class_id ?? null))) {
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
  await notifyClassOfEvent(created, 'added', actor.id)
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
  if (!(await canWriteCalendar(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this event.')
  }
  const moved = patch.class_id !== undefined && patch.class_id !== existing.class_id
  if (patch.class_id !== undefined && moved && !(await canWriteCalendar(actor, patch.class_id))) {
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
  // Decided from the patch BEFORE the write, so it does not depend on `existing` and the row
  // the write returns being separate objects.
  const planChanged = changesThePlan(existing, { ...existing, ...definedOnly(patch) })
  const updated = await updateEventRow(id, patch)
  await auditPrivilegedAction(actor, moved ? 'event.move' : 'event.update', 'calendar_event', id)
  if (planChanged) {
    await notifyClassOfEvent(updated, 'changed', actor.id)
    // An event moved out of a class is gone from that class's calendar.
    if (moved && existing.class_id) await notifyClassOfEvent(existing, 'removed', actor.id)
  }
  return updated
}

export async function updateEventFromApiInput(actor: Profile, id: unknown, input: unknown): Promise<CalendarEvent> {
  throttleWrite('calendar', actor.id, 'calendar')
  return updateEvent(actor, validateEventId(id), validateUpdateEventInput(input))
}

export async function deleteEvent(actor: Profile, id: string): Promise<void> {
  const existing = await getEvent(id)
  if (!existing) throw new NotFoundError('Event not found')
  // DELETE is destructive, so it is tutor/admin only (canWriteClass), NOT the broader
  // canWriteCalendar a mentor holds for create/edit - mirrors the calendar_events_delete
  // RLS policy (teaches_class_write), so a mentor gets a clean 403 here, never a 500.
  if (!(await canWriteClass(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this event.')
  }
  await deleteEventRow(id)
  await auditPrivilegedAction(actor, 'event.delete', 'calendar_event', id)
  await notifyClassOfEvent(existing, 'removed', actor.id)
}

export async function deleteEventFromApiInput(actor: Profile, id: unknown): Promise<void> {
  throttleWrite('calendar', actor.id, 'calendar')
  await deleteEvent(actor, validateEventId(id))
}
