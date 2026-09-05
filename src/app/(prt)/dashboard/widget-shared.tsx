import type { Profile } from '@/lib/auth/profile'
import { myClassIds } from '@/lib/services/classes'
import { listSlots } from '@/lib/services/timetable-slots'
import { todayInZone } from '@/lib/time/format'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { expandSlots, nextCalendarDate, zonedDayStartMs } from '@/lib/time/expand-slots'

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
  const slots = await listSlots({ classIds, activeOnly: true })
  if (slots.length === 0) return []

  const startDate = new Date(zonedDayStartMs(todayInZone(timeZone), timeZone)).toISOString()
  const endDate = new Date(zonedDayStartMs(calendarDatePlusDays(todayInZone(timeZone), 14), timeZone)).toISOString()
  const byId = new Map(slots.map((slot) => [slot.id, slot]))

  return expandSlots(slots, startDate, endDate, timeZone)
    .filter((occurrence) => Date.parse(occurrence.startIso) >= nowMs)
    .map((occurrence) => {
      const slot = byId.get(occurrence.slotId)!
      return {
        slotId: slot.id,
        subject: slot.subject,
        classId: slot.class_id,
        startIso: occurrence.startIso,
        endIso: occurrence.endIso,
      }
    })
    .slice(0, limit)
}
