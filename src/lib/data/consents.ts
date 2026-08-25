import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

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
