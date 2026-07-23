import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Table access for `timetable_slots` - the recurring weekly schedule, as
 * distinct from the dated one-off entries in `calendar_events`.
 *
 * RLS client throughout; policy scopes rows to an enrolled student, a tutor of
 * the course, or an admin. The domain (src/lib/services/timetable-slots) adds
 * the app-side canWriteClass checks on top.
 */

export type TimetableSlotRow = {
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

export type TimetableSlotInsert = Omit<TimetableSlotRow, 'id' | 'created_at'>
export type TimetableSlotPatch = Partial<Omit<TimetableSlotRow, 'id' | 'created_at'>>

export type SlotFilters = {
  classId?: string
  classIds?: string[]
  dayOfWeek?: number
  activeOnly?: boolean
  limit?: number
}

/** Slots ordered by weekday. `activeOnly` defaults to true - callers wanting
 *  deactivated slots too must ask for them explicitly by passing false. */
export async function selectSlots(filters: SlotFilters = {}): Promise<TimetableSlotRow[]> {
  const supabase = await createClient()
  let q = supabase.from('timetable_slots').select('*').order('day_of_week', { ascending: true })
  if (filters.classId) q = q.eq('class_id', filters.classId)
  if (filters.classIds) q = q.in('class_id', filters.classIds)
  if (filters.dayOfWeek != null) q = q.eq('day_of_week', filters.dayOfWeek)
  if (filters.activeOnly !== false) q = q.eq('active', true)
  if (filters.limit) q = q.limit(filters.limit)
  const { data, error } = await q
  if (error) throw new Error(`listSlots: ${error.message}`)
  return (data ?? []) as TimetableSlotRow[]
}

export async function selectSlotById(id: string): Promise<TimetableSlotRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('timetable_slots').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getSlot: ${error.message}`)
  return (data as TimetableSlotRow) ?? null
}

export async function insertSlot(row: TimetableSlotInsert): Promise<TimetableSlotRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('timetable_slots').insert(row).select('*').single()
  if (error) throw new Error(`createSlot: ${error.message}`)
  return data as TimetableSlotRow
}

export async function updateSlot(id: string, patch: TimetableSlotPatch): Promise<TimetableSlotRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('timetable_slots').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`updateSlot: ${error.message}`)
  return data as TimetableSlotRow
}
