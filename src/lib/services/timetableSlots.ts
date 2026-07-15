import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import type { CreateSlotInput, UpdateSlotInput } from '@/lib/validation/timetableSlot'
import { canWriteClass } from '@/lib/permission'
import { getProfileById } from '@/lib/services/users'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

export type TimetableSlot = {
  id: string
  class_id: string
  subject: string
  teacher_id: string | null
  day_of_week: number
  start_time: string // "HH:mm[:ss]" wall-clock in org_settings.timezone
  end_time: string
  mode_or_location: string | null
  active: boolean
  created_at: string
}

// RLS scopes the rows: enrolled student / teacher-of-course / admin.
export async function listSlots(opts: { classId?: string; activeOnly?: boolean } = {}): Promise<TimetableSlot[]> {
  const supabase = await createClient()
  let q = supabase.from('timetable_slots').select('*').order('day_of_week', { ascending: true })
  if (opts.classId) q = q.eq('class_id', opts.classId)
  if (opts.activeOnly !== false) q = q.eq('active', true)
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

/** teacher_id is optional (a slot can be created unassigned); when present,
 *  make sure it's actually an active teacher, not an arbitrary/foreign
 *  profile id. */
async function assertActiveTeacher(teacherId: string): Promise<void> {
  const t = await getProfileById(teacherId)
  if (!t || t.role !== 'teacher' || t.status !== 'active') {
    throw new ValidationError('teacher_id must be an active teacher')
  }
}

export async function createSlot(actor: Profile, input: CreateSlotInput): Promise<TimetableSlot> {
  if (!(await canWriteClass(actor, input.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  if (input.teacher_id) await assertActiveTeacher(input.teacher_id)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('timetable_slots')
    .insert({
      class_id: input.class_id,
      subject: input.subject,
      teacher_id: input.teacher_id ?? null,
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
  await writeAudit({ actor_id: actor.id, action: 'timetable.create', entity_type: 'timetable_slot', entity_id: created.id })
  return created
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
  if (patch.teacher_id) await assertActiveTeacher(patch.teacher_id)

  const updated = await updateSlotRow(id, patch)
  await writeAudit({
    actor_id: actor.id,
    action: patch.teacher_id ? 'timetable.reassign' : 'timetable.update',
    entity_type: 'timetable_slot',
    entity_id: id,
  })
  return updated
}

// Deactivate = soft-delete (spec §8: content soft-deleted; the slot stops expanding).
export async function deactivateSlot(actor: Profile, id: string): Promise<TimetableSlot> {
  const existing = await getSlot(id)
  if (!existing) throw new NotFoundError('Timetable slot not found')
  if (!(await canWriteClass(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this class.')
  }
  const updated = await updateSlotRow(id, { active: false })
  await writeAudit({ actor_id: actor.id, action: 'timetable.deactivate', entity_type: 'timetable_slot', entity_id: id })
  return updated
}
