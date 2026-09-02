import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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
}

/**
 * The person's MOST RECENT recorded consent, read through their OWN RLS session (0073's
 * self-read policy), so a person only ever reads their own. null if none yet. Lets the app
 * surface WHICH policy versions a person accepted and WHEN, and detect when a new version
 * needs re-acceptance.
 */
export async function selectLatestConsent(profileId: string): Promise<ConsentRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('consents')
    .select('terms_version, privacy_version, guardian_consent, cross_border_consent, accepted_at')
    .eq('profile_id', profileId)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as ConsentRow) ?? null
}
