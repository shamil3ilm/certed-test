import { selectOrgSettings, type OrgSettingsRow } from '@/lib/data/org-settings'

export type OrgSettings = OrgSettingsRow

/**
 * Global institutional config (name, timezone, currency, bank details, terms).
 * Read service-role rather than under the caller's RLS - see the note in
 * src/lib/data/org-settings for why that is required rather than convenient.
 */
export async function getOrgSettings(): Promise<OrgSettings> {
  return selectOrgSettings()
}

/** Formats a sequential document number, e.g. receiptNumber('CEA-R', 2026, 7) -> 'CEA-R-2026-0007'. */
export function receiptNumber(prefix: string, year: number, n: number): string {
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`
}
