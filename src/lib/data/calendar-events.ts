import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Table access for `calendar_events`. RLS client throughout, and it carries real
 * weight here: policy scopes rows to global events plus the courses the caller
 * is enrolled in or teaches, with an admin seeing all. The domain
 * (src/lib/services/calendar-events) adds the app-side canWriteClass checks on
 * top of that.
 */

export type CalendarEventKind = 'event' | 'holiday' | 'cancellation' | 'reschedule'

export type CalendarEventRow = {
  id: string
  title: string
  description: string | null
  event_date: string // "YYYY-MM-DD" wall-clock date in org_settings.timezone
  start_time: string | null
  end_time: string | null
  class_id: string | null // null = global
  kind: CalendarEventKind
  slot_id: string | null
  created_by: string
  created_at: string
}

export type CalendarEventInsert = Omit<CalendarEventRow, 'id' | 'created_at'>
export type CalendarEventPatch = Partial<Omit<CalendarEventRow, 'id' | 'created_at' | 'created_by'>>

/** Events in an optional date window, soonest first. */
export async function selectEvents(
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<CalendarEventRow[]> {
  const supabase = await createClient()
  let q = supabase.from('calendar_events').select('*').order('event_date', { ascending: true })
  if (opts.from) q = q.gte('event_date', opts.from)
  if (opts.to) q = q.lte('event_date', opts.to)
  if (opts.limit) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) throw new Error(`listEvents: ${error.message}`)
  return (data ?? []) as CalendarEventRow[]
}

export async function selectEventById(id: string): Promise<CalendarEventRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('calendar_events').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getEvent: ${error.message}`)
  return (data as CalendarEventRow) ?? null
}

export async function insertEvent(row: CalendarEventInsert): Promise<CalendarEventRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('calendar_events').insert(row).select('*').single()
  if (error) throw new Error(`createEvent: ${error.message}`)
  return data as CalendarEventRow
}

export async function updateEventRow(id: string, patch: CalendarEventPatch): Promise<CalendarEventRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('calendar_events').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`updateEvent: ${error.message}`)
  return data as CalendarEventRow
}

export async function deleteEventRow(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw new Error(`deleteEvent: ${error.message}`)
}
