import type { SlotOccurrence } from '@/lib/time/expand-slots'
import type { CalendarEventKind } from '@/lib/services/calendar-events'
import type { AssignmentType } from '@/lib/data/assignments'
import { matchExams, matchOccurrences, type HeldSession } from './held'

// A sat assessment reads as itself ("Exam: ...", "Quiz: ...", "Test: ..."); everything
// else - submitted work (assignment/project) and any legacy/undefined type - reads as a
// deadline ("Due: ..."). Fallback-to-deadline keeps a type-less mock/legacy row safe.
function assignmentTitle(type: AssignmentType, title: string): string {
  if (type === 'exam' || type === 'quiz' || type === 'test') {
    return `${type[0].toUpperCase()}${type.slice(1)}: ${title}`
  }
  return `Due: ${title}`
}

// A wall-clock "YYYY-MM-DD" + "HH:mm" in `anchorTz` -> absolute UTC instant.
// Reuses the same DST-correct primitive as expandSlots, kept local to avoid a circular import.
function zonedDateTimeToIso(dateYmd: string, hm: string, anchorTz: string): string {
  const [y, mo, d] = dateYmd.split('-').map(Number)
  const [h, mi] = hm.split(':').map(Number)
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, 0)
  const offset = (instantMs: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: anchorTz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(instantMs))
    const g = (t: string) => Number(parts.find((p) => p.type === t)!.value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - instantMs
  }
  let guess = naiveUtc - offset(naiveUtc)
  guess = naiveUtc - offset(guess)
  return new Date(guess).toISOString()
}

type CalendarSource = 'slot' | 'event' | 'assignment' | 'meet' | 'session'

export type CalendarItem = {
  id: string // source-prefixed, stable
  source: CalendarSource
  title: string
  start: string // absolute UTC ISO, OR "YYYY-MM-DD" when allDay
  end: string | null
  allDay: boolean
  classId: string | null
  kind: CalendarEventKind | 'timetable' | 'deadline' | 'meet' | 'session'
  location?: string | null
  /** For an assignment-source item, the classwork type (assignment/exam/quiz/...). */
  type?: AssignmentType
  /** A recorded session was held for this: a class that took place, or an exam that was sat. */
  held?: boolean
}

export type MergeInput = {
  slotOccurrences: SlotOccurrence[]
  slotMeta: Record<string, { subject: string; classId: string; location: string | null }>
  events: Array<{
    id: string
    title: string
    event_date: string
    start_time: string | null
    end_time: string | null
    class_id: string | null
    kind: CalendarEventKind
    slot_id?: string | null
  }>
  assignments: Array<{ id: string; title: string; due_date: string; class_id: string; type: AssignmentType }>
  /** Scheduled meet links (scheduled_at already an absolute UTC instant). */
  meets?: Array<{ id: string; title: string; scheduled_at: string; class_id: string | null }>
  /** Sessions recorded in the window - what actually happened, as against the timetable's plan. */
  sessions?: HeldSession[]
  /** Optional classId -> human label (e.g. the enrolled student's name). When
   *  present, exam events and assignment deadlines get " · {label}" appended so a
   *  viewer who sees many classes (tutor/mentor/admin) can tell them apart. Omitted
   *  for a student, whose feed is already only their own class. */
  classLabels?: Record<string, string>
  anchorTz: string
}

// Wall-clock calendar date ("YYYY-MM-DD") of an absolute instant in `tz` - the
// inverse of zonedDateTimeToIso, used to match a slot occurrence to a same-day
// cancellation/reschedule event.
function wallClockDate(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

  const sessions = input.sessions ?? []
  const liveOccurrences = input.slotOccurrences.filter(
    (occ) => !suppressed.has(`${occ.slotId}|${wallClockDate(occ.startIso, input.anchorTz)}`),
  )
  const occurrenceKey = (occ: { slotId: string; startIso: string }) => `${occ.slotId}|${occ.startIso}`
  const heldOccurrences = matchOccurrences(
    liveOccurrences.map((occ) => ({
      key: occurrenceKey(occ),
      classId: input.slotMeta[occ.slotId]?.classId ?? null,
      startIso: occ.startIso,
      endIso: occ.endIso,
    })),
    sessions,
  )
  const heldExams = matchExams(
    input.assignments.filter((a) => a.type === 'exam'),
    sessions,
    (iso) => wallClockDate(iso, input.anchorTz),
  )
  // A session explains a planned item or stands alone as an extra one: never both, never neither.
  const explained = new Set<string>([...heldOccurrences.values(), ...heldExams.values()])

  for (const occ of liveOccurrences) {
    const meta = input.slotMeta[occ.slotId]
    const base = meta ? `${meta.subject}${meta.location ? ` - ${meta.location}` : ''}` : 'Class'
    const label = meta ? input.classLabels?.[meta.classId] : undefined
    const held = heldOccurrences.has(occurrenceKey(occ))
    const named = label ? `${base} · ${label}` : base
    items.push({
      id: `slot-${occ.slotId}-${occ.startIso}`,
      source: 'slot',
      title: held ? `${named} · held` : named,
      held: held || undefined,
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
    // Every class-scoped event carries the class label (academy-wide events, with a
    // null class_id, have nothing to label).
    const label = ev.class_id ? input.classLabels?.[ev.class_id] : undefined
    items.push({
      id: `event-${ev.id}`,
      source: 'event',
      title: label ? `${ev.title} · ${label}` : ev.title,
      start: timed ? zonedDateTimeToIso(ev.event_date, ev.start_time!, input.anchorTz) : ev.event_date,
      end: timed && ev.end_time ? zonedDateTimeToIso(ev.event_date, ev.end_time, input.anchorTz) : null,
      allDay: !timed,
      classId: ev.class_id,
      kind: ev.kind,
    })
  }

  for (const a of input.assignments) {
    const label = input.classLabels?.[a.class_id]
    const base = assignmentTitle(a.type, a.title)
    const held = heldExams.has(a.id)
    const named = label ? `${base} · ${label}` : base
    items.push({
      id: `assignment-${a.id}`,
      source: 'assignment',
      title: held ? `${named} · held` : named,
      held: held || undefined,
      start: a.due_date, // already an absolute UTC instant
      end: null,
      allDay: false,
      classId: a.class_id,
      kind: 'deadline',
      type: a.type,
    })
  }

  for (const m of input.meets ?? []) {
    const label = m.class_id ? input.classLabels?.[m.class_id] : undefined
    const base = `Meet: ${m.title}`
    items.push({
      id: `meet-${m.id}`,
      source: 'meet',
      title: label ? `${base} · ${label}` : base,
      start: m.scheduled_at, // already an absolute UTC instant
      end: null,
      allDay: false,
      classId: m.class_id,
      kind: 'meet',
    })
  }

  // Whatever happened that the plan does not show: an extra class, a make-up, a session held on a
  // day the timetable said it was cancelled.
  for (const session of sessions) {
    if (explained.has(session.id)) continue
    const label = input.classLabels?.[session.class_id]
    const what = session.kind === 'regular' ? '' : ` (${session.kind})`
    const base = `Held: ${session.subjectName ?? 'Class'}${what}`
    items.push({
      id: `session-${session.id}`,
      source: 'session',
      title: label ? `${base} · ${label}` : base,
      start: session.actual_start,
      end: session.actual_end,
      allDay: false,
      classId: session.class_id,
      kind: 'session',
      held: true,
    })
  }

  return items
}
