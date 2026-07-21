import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import { createSlotSchema, updateSlotSchema, type CreateSlotInput, type UpdateSlotInput } from '@/lib/validation/timetable-slot'
import { canWriteClass } from '@/lib/permission'
import { getProfileById } from '@/lib/services/users'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError, RateLimitError } from '@/lib/errors'
import { rateLimit } from '@/lib/security/rate-limit'
import { z } from 'zod'

/** Per-user throttle across the timetable-write API surface (create/update/
 *  deactivate), applied at the API boundary against write spam. */
function assertTimetableWriteRate(actorId: string): void {
  if (!rateLimit(`timetable-write:${actorId}`, { limit: 60, windowMs: 60_000 }).ok) {
    throw new RateLimitError('Too many timetable changes in a short time. Please wait a moment.')
  }
}

export type TimetableSlot = {
  id: string
  class_id: string
  subject: string
  tutor_id: string | null
  day_of_week: number
  start_time: string // "HH:mm[:ss]" wall-clock in org_settings.timezone
  end_time: string
  mode_or_location: string | null
  active: boolean
  created_at: string
}

const slotIdSchema = z.string().uuid()

export function validateCreateSlotInput(input: unknown): CreateSlotInput {
  const parsed = createSlotSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'invalid')
  }
  return parsed.data
}

export function validateUpdateSlotInput(input: unknown): UpdateSlotInput {
  const parsed = updateSlotSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'invalid')
  }
  return parsed.data
}

export function validateSlotId(input: unknown): string {
  const parsed = slotIdSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Invalid timetable slot id')
  }
  return parsed.data
}

// RLS scopes the rows: enrolled student / tutor-of-course / admin.
export async function listSlots(
  opts: { classId?: string; classIds?: string[]; dayOfWeek?: number; activeOnly?: boolean; limit?: number } = {},
): Promise<TimetableSlot[]> {
  const supabase = await createClient()
  let q = supabase.from('timetable_slots').select('*').order('day_of_week', { ascending: true })
  if (opts.classId) q = q.eq('class_id', opts.classId)
  if (opts.classIds) q = q.in('class_id', opts.classIds)
  if (opts.dayOfWeek != null) q = q.eq('day_of_week', opts.dayOfWeek)
  if (opts.activeOnly !== false) q = q.eq('active', true)
  if (opts.limit) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) throw new Error(`listSlots: ${error.message}`)
  return (data ?? []) as TimetableSlot[]
}

export async function getSlot(id: string): Promise<TimetableSlot | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('timetable_slots').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getSlot: ${error.message}`)
  return (data as TimetableSlot) ?? null
}

/** tutor_id is optional (a slot can be created unassigned); when present,
 *  make sure it's actually an active tutor, not an arbitrary/foreign
 *  profile id. */
async function assertActiveTutor(tutorId: string): Promise<void> {
  const t = await getProfileById(tutorId)
  if (!t || t.role !== 'tutor' || t.status !== 'active') {
    throw new ValidationError('tutor_id must be an active tutor')
  }
}

export async function createSlot(actor: Profile, input: CreateSlotInput): Promise<TimetableSlot> {
  if (!(await canWriteClass(actor, input.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  if (input.tutor_id) await assertActiveTutor(input.tutor_id)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('timetable_slots')
    .insert({
      class_id: input.class_id,
      subject: input.subject,
      tutor_id: input.tutor_id ?? null,
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      mode_or_location: input.mode_or_location ?? null,
      active: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createSlot: ${error.message}`)
  const created = data as TimetableSlot
  await auditPrivilegedAction(actor, 'timetable.create', 'timetable_slot', created.id)
  return created
}

export async function createSlotFromApiInput(actor: Profile, input: unknown): Promise<TimetableSlot> {
  assertTimetableWriteRate(actor.id)
  return createSlot(actor, validateCreateSlotInput(input))
}

async function updateSlotRow(id: string, patch: UpdateSlotInput): Promise<TimetableSlot> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('timetable_slots').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`updateSlot: ${error.message}`)
  return data as TimetableSlot
}

export async function updateSlot(actor: Profile, id: string, patch: UpdateSlotInput): Promise<TimetableSlot> {
  const existing = await getSlot(id)
  if (!existing) throw new NotFoundError('Timetable slot not found')
  if (!(await canWriteClass(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  if (patch.tutor_id) await assertActiveTutor(patch.tutor_id)

  const updated = await updateSlotRow(id, patch)
  await auditPrivilegedAction(actor, patch.tutor_id ? 'timetable.reassign' : 'timetable.update', 'timetable_slot', id)
  return updated
}

export async function updateSlotFromApiInput(actor: Profile, id: unknown, input: unknown): Promise<TimetableSlot> {
  assertTimetableWriteRate(actor.id)
  return updateSlot(actor, validateSlotId(id), validateUpdateSlotInput(input))
}

// Deactivate = soft-delete (spec section 8: content soft-deleted; the slot stops expanding).
export async function deactivateSlot(actor: Profile, id: string): Promise<TimetableSlot> {
  const existing = await getSlot(id)
  if (!existing) throw new NotFoundError('Timetable slot not found')
  if (!(await canWriteClass(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  const updated = await updateSlotRow(id, { active: false })
  await auditPrivilegedAction(actor, 'timetable.deactivate', 'timetable_slot', id)
  return updated
}

export async function deactivateSlotFromApiInput(actor: Profile, id: unknown): Promise<TimetableSlot> {
  assertTimetableWriteRate(actor.id)
  return deactivateSlot(actor, validateSlotId(id))
}
