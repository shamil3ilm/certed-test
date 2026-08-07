/**
 * Institute display zone. Used as the deterministic SSR/first-render fallback in
 * <LocalTime>, which then re-renders in the viewer's own device zone after mount.
 * (Server rendering can't know the viewer's zone, so a fixed fallback is what
 * keeps hydration from mismatching; the client swap gives everyone device-local
 * time consistently.) Never use bare toLocale* in components - use <LocalTime>.
 */
export const DISPLAY_TZ = 'Asia/Kolkata'

/** True if `tz` is an IANA zone Intl accepts (an unknown zone would throw). */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Today's calendar date (YYYY-MM-DD) in the given IANA zone - for "today"
 *  defaults that must match the local day, not UTC (which is a day behind before
 *  ~05:30 IST). en-CA formats as YYYY-MM-DD. Falls back to the display zone if
 *  `timeZone` is not a valid IANA zone, so a bad org setting can't 500 a page. */
export function todayInZone(timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : DISPLAY_TZ
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

/** Day-of-week (0=Sun..6=Sat) for "today" in the given IANA zone - matches
 *  timetable_slots.day_of_week's convention. Derived from the calendar date
 *  string (not a raw `new Date().getDay()`, which would use the server's zone).
 *
 *  Pass the CONFIGURED institute timezone (getInstituteTimeZone()) for date
 *  logic - "today" and default session dates - so it agrees with the calendar
 *  and timetable, which anchor to org_settings.timezone. DISPLAY_TZ is only the
 *  fixed SSR/display fallback for <LocalTime>, never the source for date logic. */
export function todayDayOfWeekInZone(timeZone: string): number {
  return new Date(`${todayInZone(timeZone)}T00:00:00Z`).getUTCDay()
}

/**
 * True only for a real YYYY-MM-DD calendar date. `Date.parse` ROLLS OVER invalid
 * days (2026-04-31 -> May 1, 2025-02-29 -> Mar 1), which Postgres' `date` type then
 * rejects - so round-trip through UTC and require the string to come back
 * unchanged. Use before passing a user-supplied date to a `date` column query.
 */
export function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** "20 Jun 2026". Omit timeZone to format in the runtime zone (the device, on the client). */
export function formatDate(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

/** "20 Jun 2026, 1:30 pm". Omit timeZone to format in the runtime zone (the device, on the client). */
export function formatDateTime(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

/** "1:30 pm" - time only, e.g. a range end where the date is already shown. Omit
 *  timeZone to format in the runtime (device) zone. */
export function formatTime(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

/**
 * Format an absolute instant (UTC ISO string) for display. Data is stored as
 * absolute instants; a caller may pin an explicit IANA zone (used in tests and
 * the institute-anchor previews), otherwise the runtime's device zone is used.
 */
export function formatInstant(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`formatInstant: invalid iso "${iso}"`)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}
