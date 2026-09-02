import { DISPLAY_TZ, isValidTimeZone } from '@/lib/time/format'

/**
 * The UTC instant boundaries of a calendar MONTH, measured in a given IANA zone.
 *
 * Teaching-hour totals are "1st to last day of the month", and the boundary has to
 * be the LOCAL month edge (the institute timezone), not UTC - in Asia/Kolkata (UTC+5:30)
 * a session at 00:30 on the 1st is still the previous UTC day, so a UTC boundary would
 * file it in the wrong month. We compute the UTC instant that corresponds to local
 * midnight on the 1st, and on the 1st of the next month, giving a half-open [start, end)
 * window to compare an instant (e.g. class_sessions.actual_start) against.
 *
 * India (the primary zone) has no DST, so the offset is exact; for a DST zone the day-1
 * offset is used, which is correct for month boundaries (transitions never fall on a
 * month's first instant in practice). Pure - no IO - so it is unit-testable.
 */

export interface MonthWindow {
  /** 'YYYY-MM' echoed back. */
  month: string
  /** Inclusive start: the UTC ISO instant of local midnight on the 1st. */
  startIso: string
  /** Exclusive end: the UTC ISO instant of local midnight on the 1st of next month. */
  endIso: string
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** True for a real 'YYYY-MM' value. */
export function isMonth(value: string): boolean {
  return MONTH_RE.test(value)
}

/** The offset (localZone - UTC) in ms at `instant` for `tz`. */
function zoneOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  // The wall-clock the zone shows for `instant`, read back as if it were UTC.
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - instant.getTime()
}

/** UTC instant of local midnight (00:00 in `tz`) on the given YYYY-MM-DD. */
function zonedMidnightUtc(dateStr: string, tz: string): Date {
  // Guess the instant as if the local date were UTC, then subtract the zone offset.
  const guess = new Date(`${dateStr}T00:00:00Z`)
  return new Date(guess.getTime() - zoneOffsetMs(guess, tz))
}

/** Zero-padded 'YYYY-MM' for a year + 1-based month, rolling December into next year. */
function nextMonthFirst(year: number, month1: number): string {
  const y = month1 === 12 ? year + 1 : year
  const m = month1 === 12 ? 1 : month1 + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/**
 * Resolve a 'YYYY-MM' month into its [start, end) UTC instants in `tz`. Falls back to
 * the display zone if `tz` is not a valid IANA zone (a bad org setting must not throw).
 * Throws only on a malformed `month` string.
 */
export function monthWindow(month: string, tz: string): MonthWindow {
  if (!isMonth(month)) throw new Error(`monthWindow: invalid month "${month}" (expected YYYY-MM)`)
  const zone = isValidTimeZone(tz) ? tz : DISPLAY_TZ
  const [year, month1] = month.split('-').map(Number)
  const start = zonedMidnightUtc(`${month}-01`, zone)
  const end = zonedMidnightUtc(nextMonthFirst(year, month1), zone)
  return { month, startIso: start.toISOString(), endIso: end.toISOString() }
}
