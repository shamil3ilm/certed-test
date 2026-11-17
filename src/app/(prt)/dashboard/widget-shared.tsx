import type { Profile } from '@/lib/auth/profile'
import { myClassIds } from '@/lib/services/classes'
import { listSlots } from '@/lib/services/timetable-slots'
import { listEvents } from '@/lib/services/calendar-events'
import { todayInZone } from '@/lib/time/format'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import {
  expandSlots,
  nextCalendarDate,
  zonedDayStartMs,
  zonedDateTimeToIso,
  wallClockDate,
  buildSlotSuppressionSet,
} from '@/lib/time/expand-slots'
import { parseSessionTypeFromDescription } from '@/lib/attendance/session-kind'

export type ClassScopedWidgetData = {
  classIds: string[]
  timeZone: string
}

export const WIDGET_ROW_LINK =
  'group flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 text-slate-800 transition hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20'
// Stacked variant: label on top (full row width), meta beneath. Used where the meta
// is long (e.g. a full date + time) and would otherwise squeeze the label to a few
// characters inside a narrow multi-column dashboard row.
export const WIDGET_ROW_STACK =
  'group flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-xl px-3 py-2 text-slate-800 transition hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20'
export const WIDGET_ROW_META = 'shrink-0 text-xs text-slate-600 transition group-hover:text-primary/70'
export const WIDGET_CTA_LINK = 'btn btn-sm btn-soft mt-3 min-h-10 px-3 py-2 text-sm font-semibold'

export function WidgetSkeleton() {
  return <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" aria-busy="true" />
}

type UpcomingClassOccurrence = {
  slotId: string
  subject: string
  classId: string
  startIso: string
  endIso: string
}

function calendarDatePlusDays(dateYmd: string, days: number): string {
  let out = dateYmd
  for (let i = 0; i < days; i += 1) out = nextCalendarDate(out)
  return out
}

export async function resolveClassScopedData(
  me: Profile,
  data?: ClassScopedWidgetData,
): Promise<ClassScopedWidgetData> {
  if (data) return data
  const [classIds, timeZone] = await Promise.all([myClassIds(me), getInstituteTimeZone()])
  return { classIds, timeZone }
}

export async function resolveClassIds(me: Profile, data?: Pick<ClassScopedWidgetData, 'classIds'>): Promise<string[]> {
  return data?.classIds ?? myClassIds(me)
}

export async function listUpcomingClassOccurrences(
  classIds: string[],
  timeZone: string,
  nowMs: number,
  limit = 5,
): Promise<UpcomingClassOccurrence[]> {
  if (classIds.length === 0) return []
  const todayYmd = todayInZone(timeZone)
  const windowEndYmd = calendarDatePlusDays(todayYmd, 14)
  const [slots, events] = await Promise.all([
    listSlots({ classIds, activeOnly: true }),
    listEvents({ from: todayYmd, to: windowEndYmd }),
  ])

  const classIdSet = new Set(classIds)
  const occurrences: UpcomingClassOccurrence[] = []

  // A cancellation or reschedule naming a slot suppresses that occurrence on its date.
  const suppressed = buildSlotSuppressionSet(events)

  if (slots.length > 0) {
    const startDate = new Date(zonedDayStartMs(todayYmd, timeZone)).toISOString()
    const endDate = new Date(zonedDayStartMs(windowEndYmd, timeZone)).toISOString()
    const byId = new Map(slots.map((slot) => [slot.id, slot]))

    for (const occ of expandSlots(slots, startDate, endDate, timeZone)) {
      if (Date.parse(occ.startIso) >= nowMs) {
        const occDate = wallClockDate(occ.startIso, timeZone)
        if (suppressed.has(`${occ.slotId}|${occDate}`)) continue
        const slot = byId.get(occ.slotId)!
        occurrences.push({
          slotId: slot.id,
          subject: slot.subject,
          classId: slot.class_id,
          startIso: occ.startIso,
          endIso: occ.endIso,
        })
      }
    }
  }

  // Include one-off class sessions / rescheduled classes associated with the user's classes
  for (const ev of events) {
    if (ev.class_id && classIdSet.has(ev.class_id) && (ev.kind === 'event' || ev.kind === 'reschedule')) {
      const startTime = ev.start_time ?? '00:00'
      const endTime = ev.end_time ?? startTime
      const startIso = zonedDateTimeToIso(ev.event_date, startTime, timeZone)
      const endIso = zonedDateTimeToIso(ev.event_date, endTime, timeZone)
      if (Date.parse(startIso) >= nowMs) {
        const sessionType = parseSessionTypeFromDescription(ev.description)
        const isDemo = sessionType === 'demo'
        const isExam = sessionType === 'exam'
        const subject = isDemo ? `${ev.title} (demo)` : isExam ? `${ev.title} (exam)` : ev.title
        occurrences.push({
          slotId: `event-${ev.id}`,
          subject,
          classId: ev.class_id,
          startIso,
          endIso,
        })
      }
    }
  }

  return occurrences.sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso)).slice(0, limit)
}
