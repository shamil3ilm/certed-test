/**
 * Institute display zone. Used as the deterministic SSR/first-render fallback in
 * <LocalTime>, which then re-renders in the viewer's own device zone after mount.
 * (Server rendering can't know the viewer's zone, so a fixed fallback is what
 * keeps hydration from mismatching; the client swap gives everyone device-local
 * time consistently.) Never use bare toLocale* in components — use <LocalTime>.
 */
export const DISPLAY_TZ = 'Asia/Kolkata'

/** Today's calendar date (YYYY-MM-DD) in the institute display zone — for "today"
 *  defaults that must match the local day, not UTC (which is a day behind before
 *  ~05:30 IST). en-CA formats as YYYY-MM-DD. */
export function todayInDisplayZone(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ }).format(new Date())
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
