import type { Profile } from '@/lib/auth/profile'
import {
  insertSlot,
  selectSlotById,
  selectSlots,
  updateSlot as updateSlotRowInDb, // aliased: the domain's own updateSlot is the gated one
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
import { canWriteClass } from '@/lib/permission'
import { isActiveClassTutor } from '@/lib/data/class-membership'
import { getProfileById } from '@/lib/services/users'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
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

/** tutor_id is optional (a slot can be created unassigned); when present, make
 *  sure it's an active teacher account AND that they actually teach THIS class.
 *  Without the class scope, a tutor authorized for class X could label a slot in
 *  X with an unrelated colleague's id - a data-integrity/labeling defect. A
 *  dedicated mentor who teaches (i.e. is in class_tutors for the class) is valid
 *  here too, which is exactly what isActiveClassTutor checks. */
async function assertClassTutor(tutorId: string, classId: string): Promise<void> {
  const t = await getProfileById(tutorId)
  if (!t || (t.role !== 'tutor' && t.role !== 'mentor') || t.status !== 'active') {
    throw new ValidationError('tutor_id must be an active tutor or mentor')
  }
  if (!(await isActiveClassTutor(tutorId, classId))) {
    throw new ValidationError('tutor_id must be a tutor assigned to this class')
  }
}

export async function createSlot(actor: Profile, input: CreateSlotInput): Promise<TimetableSlot> {
  if (!(await canWriteClass(actor, input.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  if (input.tutor_id) await assertClassTutor(input.tutor_id, input.class_id)

  const created = await insertSlot({
    class_id: input.class_id,
    subject: input.subject,
    tutor_id: input.tutor_id ?? null,
    day_of_week: input.day_of_week,
    start_time: input.start_time,
    end_time: input.end_time,
    mode_or_location: input.mode_or_location ?? null,
    active: true,
  })
  await auditPrivilegedAction(actor, 'timetable.create', 'timetable_slot', created.id)
  return created
}

export async function createSlotFromApiInput(actor: Profile, input: unknown): Promise<TimetableSlot> {
  throttleWrite('timetable', actor.id, 'timetable')
  return createSlot(actor, validateCreateSlotInput(input))
}

export async function updateSlot(actor: Profile, id: string, patch: UpdateSlotInput): Promise<TimetableSlot> {
  const existing = await getSlot(id)
  if (!existing) throw new NotFoundError('Timetable slot not found')
  if (!(await canWriteClass(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  if (patch.tutor_id) await assertClassTutor(patch.tutor_id, existing.class_id)

  const updated = await updateSlotRowInDb(id, patch)
  await auditPrivilegedAction(actor, patch.tutor_id ? 'timetable.reassign' : 'timetable.update', 'timetable_slot', id)
  return updated
}

export async function updateSlotFromApiInput(actor: Profile, id: unknown, input: unknown): Promise<TimetableSlot> {
  throttleWrite('timetable', actor.id, 'timetable')
  return updateSlot(actor, validateSlotId(id), validateUpdateSlotInput(input))
}

// Deactivate = soft-delete (spec section 8: content soft-deleted; the slot stops expanding).
export async function deactivateSlot(actor: Profile, id: string): Promise<TimetableSlot> {
  const existing = await getSlot(id)
  if (!existing) throw new NotFoundError('Timetable slot not found')
  if (!(await canWriteClass(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  const updated = await updateSlotRowInDb(id, { active: false })
  await auditPrivilegedAction(actor, 'timetable.deactivate', 'timetable_slot', id)
  return updated
}

export async function deactivateSlotFromApiInput(actor: Profile, id: unknown): Promise<TimetableSlot> {
  throttleWrite('timetable', actor.id, 'timetable')
  return deactivateSlot(actor, validateSlotId(id))
}
