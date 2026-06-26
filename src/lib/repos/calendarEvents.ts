import { createClient } from '@/lib/supabase/server'
import type { CreateEventInput, UpdateEventInput } from '@/lib/validation/calendarEvent'

export type CalendarEventKind = 'event' | 'holiday' | 'cancellation' | 'reschedule'

export type CalendarEvent = {
  id: string
  title: string
  description: string | null
  event_date: string   // "YYYY-MM-DD" wall-clock date in org_settings.timezone
  start_time: string | null
  end_time: string | null
  course_id: string | null   // null = global
  kind: CalendarEventKind
  slot_id: string | null
  created_by: string
  created_at: string
}

// RLS scopes the rows: global events + enrolled/taught course events / admin sees all.
export async function listEvents(opts: { from?: string; to?: string } = {}): Promise<CalendarEvent[]> {
  const supabase = await createClient()
  let q = supabase.from('calendar_events').select('*').order('event_date', { ascending: true })
  if (opts.from) q = q.gte('event_date', opts.from)
  if (opts.to) q = q.lte('event_date', opts.to)
  const { data, error } = await q
  if (error) throw new Error(`listEvents: ${error.message}`)
  return (data ?? []) as CalendarEvent[]
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('calendar_events').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getEvent: ${error.message}`)
  return (data as CalendarEvent) ?? null
}

export async function createEvent(input: CreateEventInput, createdBy: string): Promise<CalendarEvent> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      title: input.title,
      description: input.description ?? null,
      event_date: input.event_date,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      course_id: input.course_id ?? null,
      kind: input.kind,
      slot_id: input.slot_id ?? null,
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createEvent: ${error.message}`)
  return data as CalendarEvent
}

export async function updateEvent(id: string, patch: UpdateEventInput): Promise<CalendarEvent> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('calendar_events').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`updateEvent: ${error.message}`)
  return data as CalendarEvent
}

export async function deleteEvent(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw new Error(`deleteEvent: ${error.message}`)
}
