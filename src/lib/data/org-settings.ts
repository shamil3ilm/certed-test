import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Table access for `org_settings` - the single row of institutional config.
 *
 * Service-role, NOT the request's RLS client, and this one is load-bearing:
 * org_settings RLS is deliberately admin-only (0017) so the sensitive bank
 * fields can't be read directly by a client, but trusted server code needs
 * these values for EVERY active user - the calendar feed's institute timezone,
 * and receipt / payslip / report-card rendering. Under the RLS client a
 * non-admin caller reads zero rows and `.single()` fails with PGRST116,
 * 500-ing those routes.
 *
 * The full row is only ever consumed server-side (PDF output, timezone); it is
 * never returned raw to a non-admin client, so the admin-only table policy
 * still stands as the guard against direct PostgREST access.
 */

export type OrgSettingsRow = {
  institute_name: string
  contact_email: string | null
  contact_phone: string | null
  bank_account: string | null
  bank_ifsc: string | null
  bank_branch: string | null
  terms_text: string | null
  signatory_name: string | null
  signatory_title: string | null
  signature_text: string | null
  /** The currency every finance figure normalises INTO for academy-wide rollups. */
  base_currency: string
  timezone: string
  receipt_prefix: string
  payslip_prefix: string
  /** Admin-configured messaging matrix ({ "a|b": true }). Null means no extra
   *  cross-persona pairs are enabled beyond the direct relationship defaults. */
  messaging_matrix: Record<string, boolean> | null
}

export async function selectOrgSettings(): Promise<OrgSettingsRow> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('org_settings').select('*').single()
  if (error) throw new Error(`org_settings: ${error.message}`)
  return data as OrgSettingsRow
}

/** Persist the messaging matrix onto the singleton org_settings row (admin-gated
 *  at the service layer). Updates every row - there is only ever one. */
export async function updateMessagingMatrix(matrix: Record<string, boolean>): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('org_settings').update({ messaging_matrix: matrix }).not('id', 'is', null)
  if (error) throw new Error(`org_settings.updateMessagingMatrix: ${error.message}`)
}

/** The institute-profile fields an admin edits from the Organization settings page
 *  (the letterhead/identity/bank/signatory/prefix fields that print on documents).
 *  Excludes base_currency, timezone and messaging_matrix, which have their own
 *  dedicated flows. */
export type OrgProfilePatch = Pick<
  OrgSettingsRow,
  | 'institute_name'
  | 'contact_email'
  | 'contact_phone'
  | 'bank_account'
  | 'bank_ifsc'
  | 'bank_branch'
  | 'terms_text'
  | 'signatory_name'
  | 'signatory_title'
  | 'signature_text'
  | 'receipt_prefix'
  | 'payslip_prefix'
>

/** Persist the institute-profile fields onto the singleton row (admin-gated at the
 *  service layer). Updates every row - there is only ever one. */
export async function updateOrgProfile(patch: OrgProfilePatch): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('org_settings').update(patch).not('id', 'is', null)
  if (error) throw new Error(`org_settings.updateOrgProfile: ${error.message}`)
}

/** Sets the academy-wide reporting base currency on the singleton row. Changing
 *  it re-bases every document, so callers follow this with a recompute. */
export async function updateBaseCurrency(currency: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('org_settings').update({ base_currency: currency }).not('id', 'is', null)
  if (error) throw new Error(`org_settings.updateBaseCurrency: ${error.message}`)
}

/**
 * Cheapest possible round-trip that proves the database is reachable, for the
 * daily cron ping that stops a free Supabase project pausing. The table is
 * arbitrary - it just has to be small and always present - so nothing should
 * read meaning into org_settings being the one chosen.
 */
export async function pingDatabase(): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin.from('org_settings').select('id').limit(1)
  return !error
}
