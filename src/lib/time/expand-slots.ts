import { isValidTimeZone } from '@/lib/time/format'

/**
 * Expand recurring weekly timetable slots into absolute UTC instants across a range.
 *
 * Each slot carries a WALL-CLOCK start/end time and a day_of_week interpreted in the
 * slot's OWN zone: `slot.timezone` (the tutor's zone, stamped at creation) when present,
 * else `anchorTz` (the institute zone, from org_settings.timezone) for legacy rows. For
 * every calendar day in [rangeStartIso, rangeEndIso) whose weekday matches IN THAT ZONE,
 * we compute the exact UTC instant for the wall-clock time in that zone (DST-aware), so the
 * produced `startIso`/`endIso` point at the correct real-world moment regardless of any
 * later display timezone. Anchoring each slot in its own zone keeps a late class a valid
 * same-day interval there, so it never straddles a foreign midnight.
 */
export type ExpandableSlot = {
  id: string
  day_of_week: number // 0=Sun .. 6=Sat, in the slot's own zone
  start_time: string // "HH:mm" or "HH:mm:ss", wall-clock in the slot's own zone
  end_time: string
  timezone?: string | null // IANA zone the slot is anchored to; null/absent -> anchorTz
}

export type SlotOccurrence = {
  slotId: string
  startIso: string // absolute UTC instant
  endIso: string // absolute UTC instant
}

const DAY_MS = 24 * 60 * 60 * 1000

// Parse "HH:mm[:ss]" -> { h, m }.
function parseHm(t: string): { h: number; m: number } {
  const [h, m] = t.split(':')
  return { h: Number(h), m: Number(m) }
}

// Offset (ms) of `tz` from UTC at a given instant: how much later local wall clock is vs UTC.
// Uses Intl to read the zoned wall-clock fields back, which is DST-correct.
function tzOffsetMs(instantMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(instantMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUTC - instantMs
}

// Absolute UTC ms for a wall-clock Y-M-D H:M in `tz` (DST-correct, two-pass fixpoint).
function zonedWallClockToUtcMs(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, 0)
  let guess = naiveUtc - tzOffsetMs(naiveUtc, tz)
  // refine once more in case the first guess landed on the wrong side of a DST transition
  guess = naiveUtc - tzOffsetMs(guess, tz)
  return guess
}

/**
 * UTC instant (ms) at 00:00 local time of calendar date `dateYmd` (YYYY-MM-DD)
 * in `tz`. The calendar window must be bounded at INSTITUTE-timezone midnight,
 * not UTC midnight, so recurring slots and assignment deadlines line up with the
 * org-local day the client actually asked for (a UTC-midnight bound shifts the
 * window by the tz offset for any non-UTC org).
 */
export function zonedDayStartMs(dateYmd: string, tz: string): number {
  const [y, mo, d] = dateYmd.split('-').map(Number)
  return zonedWallClockToUtcMs(y, mo, d, 0, 0, tz)
}

/**
 * The calendar date one day after `dateYmd` (YYYY-MM-DD). Used to turn an
 * INCLUSIVE `to` day into an exclusive "start of the day after `to`" bound, so
 * the whole final day is in range. Date-only UTC arithmetic is safe: only the
 * next Y-M-D matters, and Date.UTC rolls month/year over correctly.
 */
export function nextCalendarDate(dateYmd: string): string {
  const [y, mo, d] = dateYmd.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10)
}

// Y/M/D weekday (0=Sun) of an instant interpreted in `tz`.
function zonedYmdWeekday(instantMs: number, tz: string): { y: number; mo: number; d: number; wd: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(instantMs))
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { y: Number(get('year')), mo: Number(get('month')), d: Number(get('day')), wd: wdMap[get('weekday')] }
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

// The weekday (0=Sun) + "HH:mm" of an instant as read in `tz`.
function zonedWeekdayTime(instantMs: number, tz: string): { wd: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs))
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return { wd: WEEKDAY_INDEX[get('weekday')], time: `${get('hour')}:${get('minute')}` }
}

/**
 * Convert a RECURRING weekly wall-clock time between zones: "every {dayOfWeek} at
 * {time} in fromTz" -> the equivalent {dayOfWeek, time} in toTz. The weekday shifts
 * when the time crosses local midnight (a late-evening Gulf class lands on the next
 * India day, and vice-versa). Used to convert a tutor-entered class time to the
 * academy zone on save, and back to a viewer's zone for display.
 *
 * Well-defined for FIXED-OFFSET zones (India + the Gulf observe no DST). Across a
 * DST transition a recurring wall-clock maps to two offsets; this samples one fixed
 * reference week, which is correct for the no-DST zones this app serves. Invalid
 * zones (or identical zones) pass the value through unchanged.
 */
export function convertWeeklyTime(
  dayOfWeek: number,
  time: string,
  fromTz: string,
  toTz: string,
): { dayOfWeek: number; time: string } {
  if (fromTz === toTz) return { dayOfWeek, time }
  const { h, m } = parseHm(time)
  if (Number.isNaN(h) || Number.isNaN(m)) return { dayOfWeek, time }
  try {
    // A calendar date whose weekday IS dayOfWeek (a plain Y-M-D's weekday is
    // tz-independent). 2024-01-07 is a Sunday, so + dayOfWeek days lands on it.
    const ref = new Date(Date.UTC(2024, 0, 7 + dayOfWeek))
    const instant = zonedWallClockToUtcMs(ref.getUTCFullYear(), ref.getUTCMonth() + 1, ref.getUTCDate(), h, m, fromTz)
    const { wd, time: converted } = zonedWeekdayTime(instant, toTz)
    return { dayOfWeek: wd, time: converted }
  } catch {
    return { dayOfWeek, time }
  }
}

export function expandSlots(
  slots: ExpandableSlot[],
  rangeStartIso: string,
  rangeEndIso: string,
  anchorTz: string,
): SlotOccurrence[] {
  const startMs = Date.parse(rangeStartIso)
  const endMs = Date.parse(rangeEndIso)
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) throw new Error('invalid range')

  const occ: SlotOccurrence[] = []
  const seen = new Set<string>()
  // Iterate calendar days and, per slot, read the zoned Y/M/D + weekday IN THAT SLOT'S OWN
  // ZONE (its timezone, else anchorTz). We sample one instant per 24h hop - but UTC-midnight
  // maps to the previous local day for west-of-UTC zones, so we pad the scan by a day on each
  // side and keep only occurrences whose absolute instant lands within [startMs, endMs).
  // Dedupe by (slot, instant) guards DST-boundary days and the padding overlap.
  for (let cursor = startMs - DAY_MS; cursor < endMs + DAY_MS; cursor += DAY_MS) {
    for (const slot of slots) {
      const tz = slot.timezone && isValidTimeZone(slot.timezone) ? slot.timezone : anchorTz
      const { y, mo, d, wd } = zonedYmdWeekday(cursor, tz)
      if (slot.day_of_week !== wd) continue
      const s = parseHm(slot.start_time)
      const e = parseHm(slot.end_time)
      const startInstant = zonedWallClockToUtcMs(y, mo, d, s.h, s.m, tz)
      const endInstant = zonedWallClockToUtcMs(y, mo, d, e.h, e.m, tz)
      if (startInstant < startMs || startInstant >= endMs) continue
      const key = `${slot.id}@${startInstant}`
      if (seen.has(key)) continue
      seen.add(key)
      occ.push({
        slotId: slot.id,
        startIso: new Date(startInstant).toISOString(),
        endIso: new Date(endInstant).toISOString(),
      })
    }
  }
  occ.sort((a, b) => a.startIso.localeCompare(b.startIso))
  return occ
}
