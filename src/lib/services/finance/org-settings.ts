import { cache } from 'react'
import { unstable_cache, updateTag } from 'next/cache'
import { selectOrgSettings, type OrgSettingsRow } from '@/lib/data/org-settings'
import { DISPLAY_TZ, isValidTimeZone } from '@/lib/time/format'

export type OrgSettings = OrgSettingsRow

const ORG_SETTINGS_TAG = 'org-settings'

/**
 * Cross-request read of the single, rarely-changing settings row. It backs the
 * institute timezone, base currency, bank/signatory details and messaging matrix
 * that render on nearly every page, so caching it keeps those pages from each
 * re-reading the same row. Busted on every in-app settings write via
 * revalidateOrgSettings(); the hourly max-age is only a safety net for a change
 * made directly in the database.
 */
const loadOrgSettings = unstable_cache(async (): Promise<OrgSettings> => selectOrgSettings(), [ORG_SETTINGS_TAG], {
  tags: [ORG_SETTINGS_TAG],
  revalidate: 3600,
})

/**
 * Global institutional config (name, timezone, currency, bank details, terms).
 * Read service-role rather than under the caller's RLS - see the note in
 * src/lib/data/org-settings for why that is required rather than convenient.
 *
 * The inner cache is cross-request; this request-scoped wrapper additionally
 * collapses the several widgets that each need the institute timezone to a single
 * resolved value per render.
 */
export const getOrgSettings = cache(async (): Promise<OrgSettings> => loadOrgSettings())

/**
 * Expire the cached settings row so the next read reflects an in-app write
 * immediately (read-your-own-writes). Must be called from within a Server Action
 * - the ones that persist a settings change (base currency, messaging matrix) -
 * alongside the revalidatePath for the affected pages.
 */
export function revalidateOrgSettings(): void {
  updateTag(ORG_SETTINGS_TAG)
}

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
