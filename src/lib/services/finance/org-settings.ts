import { cache } from 'react'
import { selectOrgSettings, type OrgSettingsRow } from '@/lib/data/org-settings'
import { DISPLAY_TZ, isValidTimeZone } from '@/lib/time/format'

export type OrgSettings = OrgSettingsRow

/**
 * Global institutional config (name, timezone, currency, bank details, terms).
 * Read service-role rather than under the caller's RLS - see the note in
 * src/lib/data/org-settings for why that is required rather than convenient.
 *
 * Request-cached: the dashboard renders several widgets that each need the
 * institute timezone, and this collapses them to one read per request.
 */
export const getOrgSettings = cache(async (): Promise<OrgSettings> => {
  return selectOrgSettings()
})

/**
 * The institute's configured IANA timezone, for date LOGIC - which day is
 * "today", default attendance session dates - so those honour the same zone the
 * calendar/timetable already anchor to (org_settings.timezone) rather than a
 * hardcoded constant. Falls back to the display zone if the stored value is
 * missing or not a valid IANA zone.
 */
export async function getInstituteTimeZone(): Promise<string> {
  const tz = (await getOrgSettings()).timezone
  return isValidTimeZone(tz) ? tz : DISPLAY_TZ
}

/** Formats a sequential document number, e.g. receiptNumber('CEA-R', 2026, 7) -> 'CEA-R-2026-0007'. */
export function receiptNumber(prefix: string, year: number, n: number): string {
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`
}
