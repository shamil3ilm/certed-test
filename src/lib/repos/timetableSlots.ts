import { createClient } from '@/lib/supabase/server'
import type { CreateSlotInput, UpdateSlotInput } from '@/lib/validation/timetableSlot'

export type TimetableSlot = {
  id: string
  class_id: string
  subject: string
  teacher_id: string | null
  day_of_week: number
  start_time: string   // "HH:mm[:ss]" wall-clock in org_settings.timezone
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

export async function createSlot(input: CreateSlotInput): Promise<TimetableSlot> {
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
  return data as TimetableSlot
}

export async function updateSlot(id: string, patch: UpdateSlotInput): Promise<TimetableSlot> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('timetable_slots').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`updateSlot: ${error.message}`)
  return data as TimetableSlot
}

// Deactivate = soft-delete (spec §8: content soft-deleted; the slot stops expanding).
export async function deactivateSlot(id: string): Promise<TimetableSlot> {
  return updateSlot(id, { active: false })
}
