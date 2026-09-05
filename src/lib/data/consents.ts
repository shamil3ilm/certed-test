import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { assertMutated } from './mutation'

/**
 * Append-only consent log (table + RLS in migration 0073). Rows are written ONLY by
 * the service role - the table has no insert/update/delete policy, so the browser can
 * never forge or alter one - and a person may read their own via the RLS SELECT policy.
 */

export type ConsentInsert = {
  profile_id: string
  terms_version: string
  privacy_version: string
  guardian_consent?: boolean
  cross_border_consent?: boolean
  jurisdiction?: string | null
}

export async function insertConsent(row: ConsentInsert): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('consents').insert({
    profile_id: row.profile_id,
    terms_version: row.terms_version,
    privacy_version: row.privacy_version,
    guardian_consent: row.guardian_consent ?? false,
    cross_border_consent: row.cross_border_consent ?? false,
    jurisdiction: row.jurisdiction ?? null,
  })
  if (error) throw new Error(`consents.insert: ${error.message}`)
}

export type ConsentRow = {
  terms_version: string
  privacy_version: string
  guardian_consent: boolean
  cross_border_consent: boolean
  accepted_at: string
  /** When this acceptance was withdrawn, or null while it stands (N-07). */
  withdrawn_at: string | null
}

/**
 * The person's MOST RECENT recorded consent, read through their OWN RLS session (0073's
 * self-read policy), so a person only ever reads their own. null if none yet. Lets the app
 * surface WHICH policy versions a person accepted and WHEN, and detect when a new version
 * needs re-acceptance.
 */
export async function selectLatestConsent(profileId: string): Promise<ConsentRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consents')
    .select('terms_version, privacy_version, guardian_consent, cross_border_consent, accepted_at, withdrawn_at')
    .eq('profile_id', profileId)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  // Surfaced, not swallowed: callers read null as "no consent on record", so a failed read
  // would silently assert that someone never consented - the opposite of what the
  // append-only log exists to prove.
  if (error) throw new Error(`consents.selectLatest: ${error.message}`)
  return (data as ConsentRow) ?? null
}

/**
 * Mark a person's CURRENT acceptance as withdrawn. The row is never deleted and never
 * rewritten beyond this marker: the acceptance stays on the log as the historical fact
 * that it was given, and this records that it was later revoked. Withdrawing when nothing
 * stands is a no-op rather than an error - the desired end state is already true.
 */
export async function markLatestConsentWithdrawn(profileId: string, at: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('consents')
    .select('id')
    .eq('profile_id', profileId)
    .is('withdrawn_at', null)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`consents.selectStanding: ${error.message}`)
  if (!data) return
  const updated = await admin
    .from('consents')
    .update({ withdrawn_at: at })
    .eq('id', (data as { id: string }).id)
    .select('id')
  assertMutated(updated, 'consents.withdraw', 'Consent record not found.')
}
