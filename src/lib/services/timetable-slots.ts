import type { Profile } from '@/lib/auth/profile'
import {
  insertSlot,
  selectSlotById,
  selectSlots,
  updateSlot as updateSlotRowInDb, // aliased: the domain's own updateSlot is the gated one
  deleteSlot as deleteSlotRowInDb, // likewise - the gated one below carries the authority
  type SlotFilters,
  type TimetableSlotRow,
} from '@/lib/data/timetable-slots'
import {
  createSlotSchema,
  updateSlotSchema,
  type CreateSlotInput,
  type UpdateSlotInput,
} from '@/lib/validation/timetable-slot'
import { parseOrThrow } from '@/lib/validation/parse'
import { assertTimeOrder } from '@/lib/validation/time-order'
import { canWriteCalendar, assertClassActive } from '@/lib/permission'
import { assertClassTutor } from '@/lib/services/class-tutor-validation'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { notifyClassOfSlotChange } from '@/lib/services/timetable-notify'
import { PermissionError, NotFoundError } from '@/lib/errors'
import { throttleWrite } from '@/lib/security/throttle'
import { z } from 'zod'

export type TimetableSlot = TimetableSlotRow

const slotIdSchema = z.string().uuid()

export function validateCreateSlotInput(input: unknown): CreateSlotInput {
  return parseOrThrow(createSlotSchema, input)
}

export function validateUpdateSlotInput(input: unknown): UpdateSlotInput {
  return parseOrThrow(updateSlotSchema, input)
}

export function validateSlotId(input: unknown): string {
  return parseOrThrow(slotIdSchema, input, 'Invalid timetable slot id')
}

// RLS scopes the rows: enrolled student / tutor-of-course / admin.
export async function listSlots(opts: SlotFilters = {}): Promise<TimetableSlot[]> {
  return selectSlots(opts)
}

export async function getSlot(id: string): Promise<TimetableSlot | null> {
  return selectSlotById(id)
}

export async function createSlot(actor: Profile, input: CreateSlotInput): Promise<TimetableSlot> {
  if (!(await canWriteCalendar(actor, input.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  if (input.tutor_id) await assertClassTutor(input.tutor_id, input.class_id)
  await assertClassActive(input.class_id)

  const created = await insertSlot({
    class_id: input.class_id,
    subject: input.subject,
    tutor_id: input.tutor_id ?? null,
    day_of_week: input.day_of_week,
    start_time: input.start_time,
    end_time: input.end_time,
    mode_or_location: input.mode_or_location ?? null,
    // The creator's zone (their viewer zone); null -> the academy zone at expansion.
    timezone: input.timezone ?? null,
    active: true,
  })
  await auditPrivilegedAction(actor, 'timetable.create', 'timetable_slot', created.id)
  await notifyClassOfSlotChange(created, 'added')
  return created
}

export async function createSlotFromApiInput(actor: Profile, input: unknown): Promise<TimetableSlot> {
  throttleWrite('timetable', actor.id, 'timetable')
  return createSlot(actor, validateCreateSlotInput(input))
}

export async function updateSlot(actor: Profile, id: string, patch: UpdateSlotInput): Promise<TimetableSlot> {
  const existing = await getSlot(id)
  if (!existing) throw new NotFoundError('Timetable slot not found')
  if (!(await canWriteCalendar(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  if (patch.tutor_id) await assertClassTutor(patch.tutor_id, existing.class_id)
  // A partial patch that carries only one of start/end can invert the interval;
  // validate the EFFECTIVE pair for a clean 400 rather than tripping the DB CHECK
  // (0004) as an opaque 500. (Mirrors updateEvent, whose table has no such CHECK.)
  assertTimeOrder(
    patch.start_time !== undefined ? patch.start_time : existing.start_time,
    patch.end_time !== undefined ? patch.end_time : existing.end_time,
  )

  const updated = await updateSlotRowInDb(id, patch)
  await auditPrivilegedAction(actor, patch.tutor_id ? 'timetable.reassign' : 'timetable.update', 'timetable_slot', id)
  await notifyClassOfSlotChange(updated, 'changed')
  return updated
}

export async function updateSlotFromApiInput(actor: Profile, id: unknown, input: unknown): Promise<TimetableSlot> {
  throttleWrite('timetable', actor.id, 'timetable')
  return updateSlot(actor, validateSlotId(id), validateUpdateSlotInput(input))
}

/**
 * Remove a slot from the timetable for good.
 *
 * Pausing is the other operation and stays available: PATCH { active: false } leaves the slot
 * listed, struck through, with an Activate button. The two were the same call once, so "Delete"
 * only deactivated - leaving the row on screen looking as though nothing had happened, and no
 * way to remove a slot at all.
 *
 * A HARD delete, deliberately, where the spec soft-deletes CONTENT (announcements, submissions)
 * so a record of what was said survives. A timetable slot is not content - it is schedule
 * configuration, and a struck-through list that only ever grows is the cost of keeping every
 * one forever. Nothing is lost by removing it: calendar_events.slot_id is ON DELETE SET NULL,
 * so sessions already on the calendar survive and simply stop pointing at the slot, and the
 * audit row records the removal.
 *
 * The row is read before the delete so the caller still has something to report and the class
 * can be told what went.
 */
export async function deleteSlot(actor: Profile, id: string): Promise<TimetableSlot> {
  const existing = await getSlot(id)
  if (!existing) throw new NotFoundError('Timetable slot not found')
  if (!(await canWriteCalendar(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  await deleteSlotRowInDb(id)
  await auditPrivilegedAction(actor, 'timetable.delete', 'timetable_slot', id)
  await notifyClassOfSlotChange(existing, 'removed')
  return existing
}

export async function deleteSlotFromApiInput(actor: Profile, id: unknown): Promise<TimetableSlot> {
  throttleWrite('timetable', actor.id, 'timetable')
  return deleteSlot(actor, validateSlotId(id))
}
