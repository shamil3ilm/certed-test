/**
 * Format an absolute instant (UTC ISO string) for display.
 *
 * Phase 8 timezone rule: data is stored as absolute instants and DISPLAYED in the
 * viewer's device timezone. `formatInstant` lets a caller pin an explicit IANA zone
 * (used in tests and for the institute-anchor previews); `formatInstantDevice` uses the
 * runtime's resolved device zone, which is what end users see in the UI.
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

/** Device-timezone variant: formats the instant in the runtime's resolved zone. */
export function formatInstantDevice(iso: string): string {
  return formatInstant(iso)
}

/** The viewer's auto-detected device timezone (falls back to UTC if Intl is unavailable). */
export function deviceTimeZone(): string {
  return typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
}
