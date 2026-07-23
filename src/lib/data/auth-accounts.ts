import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Adapter for Supabase AUTH accounts (as distinct from the `profiles` table).
 * It lives in the data layer for the same reason table access does: the domain
 * should not hold a raw Supabase client. Kept separate from data/profiles because
 * this is a different backing surface - failures here mean auth, not schema.
 */

export type CreatedAuthUser = { id: string }

/** Create a confirmed auth account. Returns null when Supabase refuses, so the
 *  caller can map it to its own user-facing error rather than leaking details. */
export async function createAuthUser(email: string, password: string): Promise<CreatedAuthUser | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
  })
  if (error || !data?.user) return null
  return { id: data.user.id }
}

/** Delete an auth account - used to undo a created login when binding it to the
 *  profile loses a concurrent claim. */
export async function deleteAuthUser(authUserId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.auth.admin.deleteUser(authUserId)
}

/** Change the SIGNED-IN user's password via their own session. */
export async function updateOwnAuthPassword(password: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(`data.authAccounts.updateOwnPassword: ${error.message}`)
}
