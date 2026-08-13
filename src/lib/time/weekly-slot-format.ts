import { convertWeeklyTime } from '@/lib/time/expand-slots'
import { DISPLAY_TZ } from '@/lib/time/format'

// Short weekday labels for a recurring slot's display (0=Sun .. 6=Sat).
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export type WeeklySlotTimes = {
  day_of_week: number
  start_time: string // "HH:mm" or "HH:mm:ss" in the slot's own zone
  end_time: string
  timezone?: string | null // slot's own zone; null/absent -> academy zone
}

/**
 * Format a recurring weekly slot's weekday + start-end window in the VIEWER'S
 * zone, converting from the slot's own zone. Because the slot is stored in the
 * zone it was entered in (a valid same-day interval there), a viewer in another
 * zone may see it cross midnight - so both weekdays are shown when the start and
 * end land on different days for the viewer (e.g. "Mon 23:30 - Tue 00:30").
 *
 * A null/absent slot zone falls back to the academy display zone, matching how
 * expandSlots treats legacy rows.
 */
export function formatWeeklySlotInZone(slot: WeeklySlotTimes, viewerTz: string): string {
  const fromTz = slot.timezone || DISPLAY_TZ
  const s = convertWeeklyTime(slot.day_of_week, slot.start_time.slice(0, 5), fromTz, viewerTz)
  const e = convertWeeklyTime(slot.day_of_week, slot.end_time.slice(0, 5), fromTz, viewerTz)
  return s.dayOfWeek === e.dayOfWeek
    ? `${DAY_LABELS[s.dayOfWeek]} ${s.time}-${e.time}`
    : `${DAY_LABELS[s.dayOfWeek]} ${s.time} - ${DAY_LABELS[e.dayOfWeek]} ${e.time}`
}
