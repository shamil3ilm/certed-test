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
  signature_mode: 'text' | 'image'
  signature_text: string | null
  default_currency: string
  timezone: string
  receipt_prefix: string
  payslip_prefix: string
}

export async function selectOrgSettings(): Promise<OrgSettingsRow> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('org_settings').select('*').single()
  if (error) throw new Error(`org_settings: ${error.message}`)
  return data as OrgSettingsRow
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
