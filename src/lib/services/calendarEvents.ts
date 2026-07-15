import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import type { CreateEventInput, UpdateEventInput } from '@/lib/validation/calendarEvent'
import { canWriteClass } from '@/lib/permission'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, NotFoundError } from '@/lib/errors'

export type CalendarEventKind = 'event' | 'holiday' | 'cancellation' | 'reschedule'

export type CalendarEvent = {
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

// RLS scopes the rows: global events + enrolled/taught course events / admin sees all.
export async function listEvents(
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<CalendarEvent[]> {
  const supabase = await createClient()
  let q = supabase.from('calendar_events').select('*').order('event_date', { ascending: true })
  if (opts.from) q = q.gte('event_date', opts.from)
  if (opts.to) q = q.lte('event_date', opts.to)
  if (opts.limit) q = q.limit(opts.limit)
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

/**
 * Global events (class_id null) are admin-only; teachers may only create
 * course events they teach — canWriteClass covers exactly this rule.
 */
export async function createEvent(actor: Profile, input: CreateEventInput): Promise<CalendarEvent> {
  if (!(await canWriteClass(actor, input.class_id ?? null))) {
    throw new PermissionError('Not authorized to create this event.')
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
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
    .select('*')
    .single()
  if (error) throw new Error(`createEvent: ${error.message}`)
  const created = data as CalendarEvent
  await writeAudit({ actor_id: actor.id, action: 'event.create', entity_type: 'calendar_event', entity_id: created.id })
  return created
}

/**
 * Defense-in-depth: if the caller is MOVING the event, re-authorize the
 * DESTINATION class too — not just the class it currently belongs to. RLS
 * also blocks this, but don't let a teacher reassign an event to a class
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
  const supabase = await createClient()
  const { data, error } = await supabase.from('calendar_events').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`updateEvent: ${error.message}`)
  await writeAudit({
    actor_id: actor.id,
    action: moved ? 'event.move' : 'event.update',
    entity_type: 'calendar_event',
    entity_id: id,
  })
  return data as CalendarEvent
}

export async function deleteEvent(actor: Profile, id: string): Promise<void> {
  const existing = await getEvent(id)
  if (!existing) throw new NotFoundError('Event not found')
  if (!(await canWriteClass(actor, existing.class_id))) {
    throw new PermissionError('Not authorized for this event.')
  }
  const supabase = await createClient()
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw new Error(`deleteEvent: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'event.delete', entity_type: 'calendar_event', entity_id: id })
}
