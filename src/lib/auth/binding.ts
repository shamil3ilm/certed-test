import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * On first login, bind the authenticated user's id to their pre-created
 * allowlist profile (matched by email).
 *
 * Returns the bound profile id, or null if the email isn't allowlisted (or the
 * matching row is already bound to a different user). `admin` is injectable for
 * testing.
 */
export async function bindProfileOnFirstLogin(
  authUserId: string,
  email: string,
  admin: AdminClient = createAdminClient(),
): Promise<string | null> {
  // Already bound?
  const existing = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (existing.data) return (existing.data as { id: string }).id

  // Find the allowlist row by exact (normalized) email. Emails are stored
  // lower-cased on write, so an exact match is case-insensitive without the
  // LIKE-wildcard collision that .ilike(email) would allow (a `_`/`%` in one
  // address pattern-matching another).
  const found = await admin
    .from('profiles')
    .select('id, auth_user_id, status')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  const row = found.data as { id: string; auth_user_id: string | null } | null
  if (!row) return null
  if (row.auth_user_id) return row.auth_user_id === authUserId ? row.id : null

  // Bind it (guarded by `is null` so concurrent logins can't double-bind).
  const updated = await admin
    .from('profiles')
    .update({ auth_user_id: authUserId })
    .eq('id', row.id)
    .is('auth_user_id', null)
    .select('id')
    .single()
  if (updated.error) return null
  return (updated.data as { id: string } | null)?.id ?? null
}
