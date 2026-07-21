import type { SlotOccurrence } from '@/lib/time/expand-slots'
import type { CalendarEventKind } from '@/lib/services/calendar-events'

// A wall-clock "YYYY-MM-DD" + "HH:mm" in `anchorTz` -> absolute UTC instant.
// Reuses the same DST-correct primitive as expandSlots, kept local to avoid a circular import.
function zonedDateTimeToIso(dateYmd: string, hm: string, anchorTz: string): string {
  const [y, mo, d] = dateYmd.split('-').map(Number)
  const [h, mi] = hm.split(':').map(Number)
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, 0)
  const offset = (instantMs: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: anchorTz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(instantMs))
    const g = (t: string) => Number(parts.find((p) => p.type === t)!.value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - instantMs
  }
  let guess = naiveUtc - offset(naiveUtc)
  guess = naiveUtc - offset(guess)
  return new Date(guess).toISOString()
}

export type CalendarSource = 'slot' | 'event' | 'assignment'

export type CalendarItem = {
  id: string                 // source-prefixed, stable
  source: CalendarSource
  title: string
  start: string              // absolute UTC ISO, OR "YYYY-MM-DD" when allDay
  end: string | null
  allDay: boolean
  classId: string | null
  kind: CalendarEventKind | 'timetable' | 'deadline'
  location?: string | null
}

export type MergeInput = {
  slotOccurrences: SlotOccurrence[]
  slotMeta: Record<string, { subject: string; classId: string; location: string | null }>
  events: Array<{
    id: string; title: string; event_date: string
    start_time: string | null; end_time: string | null
    class_id: string | null; kind: CalendarEventKind
    slot_id?: string | null
  }>
  assignments: Array<{ id: string; title: string; due_date: string; class_id: string }>
  anchorTz: string
}

// Wall-clock calendar date ("YYYY-MM-DD") of an absolute instant in `tz` - the
// inverse of zonedDateTimeToIso, used to match a slot occurrence to a same-day
// cancellation/reschedule event.
function wallClockDate(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find((p) => p.type === t)!.value
  return `${g('year')}-${g('month')}-${g('day')}`
}

export function mergeCalendar(input: MergeInput): CalendarItem[] {
  const items: CalendarItem[] = []

  // A cancellation/reschedule event that names a slot suppresses that slot's
  // occurrence on its date: a cancelled class must not still show its recurring
  // slot (the event itself stays visible so the change is explicit). Key by
  // slot + wall-clock date.
  const suppressed = new Set<string>()
  for (const ev of input.events) {
    if ((ev.kind === 'cancellation' || ev.kind === 'reschedule') && ev.slot_id) {
      suppressed.add(`${ev.slot_id}|${ev.event_date}`)
    }
  }

  for (const occ of input.slotOccurrences) {
    if (suppressed.has(`${occ.slotId}|${wallClockDate(occ.startIso, input.anchorTz)}`)) continue
    const meta = input.slotMeta[occ.slotId]
    items.push({
      id: `slot-${occ.slotId}-${occ.startIso}`,
      source: 'slot',
      title: meta ? `${meta.subject}${meta.location ? ` - ${meta.location}` : ''}` : 'Class',
      start: occ.startIso,
      end: occ.endIso,
      allDay: false,
      classId: meta?.classId ?? null,
      kind: 'timetable',
      location: meta?.location ?? null,
    })
  }

  for (const ev of input.events) {
    const timed = ev.start_time != null
    items.push({
      id: `event-${ev.id}`,
      source: 'event',
      title: ev.title,
      start: timed ? zonedDateTimeToIso(ev.event_date, ev.start_time!, input.anchorTz) : ev.event_date,
      end: timed && ev.end_time ? zonedDateTimeToIso(ev.event_date, ev.end_time, input.anchorTz) : null,
      allDay: !timed,
      classId: ev.class_id,
      kind: ev.kind,
    })
  }

  for (const a of input.assignments) {
    items.push({
      id: `assignment-${a.id}`,
      source: 'assignment',
      title: `Due: ${a.title}`,
      start: a.due_date,   // already an absolute UTC instant
      end: null,
      allDay: false,
      classId: a.class_id,
      kind: 'deadline',
    })
  }

  return items
}
