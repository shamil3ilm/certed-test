import {
  zonedDateTimeToIso,
  wallClockDate,
  buildSlotSuppressionSet,
  type SlotOccurrence,
} from '@/lib/time/expand-slots'
import { parseSessionTypeFromDescription } from '@/lib/attendance/session-kind'
import type { CalendarEventKind } from '@/lib/services/calendar-events'
import { isTimedAssessment, type AssignmentType } from '@/lib/assignments/types'
import { matchExams, matchOccurrences, type HeldSession } from './held'

// A sat assessment reads as itself ("Exam: ...", "Quiz: ...", "Test: ..."); everything
// else - submitted work (assignment/project) and any legacy/undefined type - reads as a
// deadline ("Due: ..."). Fallback-to-deadline keeps a type-less mock/legacy row safe.
function assignmentTitle(type: AssignmentType, title: string): string {
  if (isTimedAssessment(type)) {
    return `${type[0].toUpperCase()}${type.slice(1)}: ${title}`
  }
  return `Due: ${title}`
}

type CalendarSource = 'slot' | 'event' | 'assignment' | 'exam' | 'meet' | 'session' | 'reminder'

export type CalendarItem = {
  id: string // source-prefixed, stable
  source: CalendarSource
  title: string
  start: string // absolute UTC ISO, OR "YYYY-MM-DD" when allDay
  end: string | null
  allDay: boolean
  classId: string | null
  kind: CalendarEventKind | 'timetable' | 'deadline' | 'meet' | 'session' | 'reminder' | 'exam' | 'assignment'
  location?: string | null
  /** For an assignment-source item, the classwork type (assignment/exam/quiz/...). */
  type?: AssignmentType
  /** For a one-off class session, the session kind (regular, demo, exam). */
  sessionType?: 'regular' | 'demo' | 'exam'
  /** A recorded session was held for this: a class that took place, or an exam that was sat. */
  held?: boolean
  /** Underlying resource id (assignment id, meet link id, session id, event id, slot id). */
  rawId?: string | null
  /** Direct URL for video calls or external links. */
  url?: string | null
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
    description?: string | null
  }>
  assignments: Array<{ id: string; title: string; due_date: string; class_id: string; type: AssignmentType }>
  /** Scheduled meet links (scheduled_at already an absolute UTC instant). */
  meets?: Array<{ id: string; title: string; scheduled_at: string; class_id: string | null; url?: string | null }>
  /** Sessions recorded in the window - what actually happened, as against the timetable's plan. */
  sessions?: HeldSession[]
  /** Reminders scheduled within the window for this user. */
  reminders?: Array<{ id: string; title: string; remind_at: string; class_id: string | null }>
  /** Optional classId -> human label (e.g. the enrolled student's name). When
   *  present, exam events and assignment deadlines get " · {label}" appended so a
   *  viewer who sees many classes (tutor/mentor/admin) can tell them apart. Omitted
   *  for a student, whose feed is already only their own class. */
  classLabels?: Record<string, string>
  anchorTz: string
}

export function mergeCalendar(input: MergeInput): CalendarItem[] {
  const items: CalendarItem[] = []

  // A cancellation/reschedule event that names a slot suppresses that slot's
  // occurrence on its date: a cancelled class must not still show its recurring
  // slot (the event itself stays visible so the change is explicit). Key by
  // slot + wall-clock date.
  const suppressed = buildSlotSuppressionSet(input.events)

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
    input.assignments.filter((a) => isTimedAssessment(a.type)),
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
      rawId: occ.slotId,
    })
  }

  for (const ev of input.events) {
    const timed = ev.start_time != null
    // Every class-scoped event carries the class label (academy-wide events, with a
    // null class_id, have nothing to label).
    const label = ev.class_id ? input.classLabels?.[ev.class_id] : undefined
    const sessionType = parseSessionTypeFromDescription(ev.description)
    // A class session scheduled from the calendar composer (tagged with session_type metadata)
    // belongs to the 'slot' (Class) category so it renders in the primary class color,
    // filters under Class, and displays as Class rather than an Event/holiday.
    const isClassSession = Boolean(sessionType)

    const baseTitle = sessionType === 'demo' ? `${ev.title} (demo)` : ev.title
    const title = label ? `${baseTitle} · ${label}` : baseTitle

    if (isClassSession) {
      items.push({
        id: `slot-event-${ev.id}`,
        source: 'slot',
        title,
        start: timed ? zonedDateTimeToIso(ev.event_date, ev.start_time!, input.anchorTz) : ev.event_date,
        end: timed && ev.end_time ? zonedDateTimeToIso(ev.event_date, ev.end_time, input.anchorTz) : null,
        allDay: !timed,
        classId: ev.class_id,
        kind: 'session',
        sessionType: sessionType ?? 'regular',
        rawId: ev.id,
      })
    } else {
      items.push({
        id: `event-${ev.id}`,
        source: 'event',
        title,
        start: timed ? zonedDateTimeToIso(ev.event_date, ev.start_time!, input.anchorTz) : ev.event_date,
        end: timed && ev.end_time ? zonedDateTimeToIso(ev.event_date, ev.end_time, input.anchorTz) : null,
        allDay: !timed,
        classId: ev.class_id,
        kind: ev.kind,
        rawId: ev.id,
      })
    }
  }

  for (const a of input.assignments) {
    const label = input.classLabels?.[a.class_id]
    const base = assignmentTitle(a.type, a.title)
    const held = heldExams.has(a.id)
    const named = label ? `${base} · ${label}` : base
    const isExam = isTimedAssessment(a.type)
    items.push({
      id: `assignment-${a.id}`,
      source: isExam ? 'exam' : 'assignment',
      title: held ? `${named} · held` : named,
      held: held || undefined,
      start: a.due_date, // already an absolute UTC instant
      end: null,
      allDay: false,
      classId: a.class_id,
      kind: isExam ? 'exam' : 'assignment',
      type: a.type,
      rawId: a.id,
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
      rawId: m.id,
      url: m.url ?? null,
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
      rawId: session.id,
    })
  }

  for (const r of input.reminders ?? []) {
    const label = r.class_id ? input.classLabels?.[r.class_id] : undefined
    const base = `Reminder: ${r.title}`
    items.push({
      id: `reminder-${r.id}`,
      source: 'reminder',
      title: label ? `${base} · ${label}` : base,
      start: r.remind_at,
      end: null,
      allDay: false,
      classId: r.class_id,
      kind: 'reminder',
      rawId: r.id,
    })
  }

  return items
}
