import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Adapter for Supabase AUTH accounts (as distinct from the `profiles` table).
 * It lives in the data layer for the same reason table access does: the domain
 * should not hold a raw Supabase client. Kept separate from data/profiles because
 * this is a different backing surface - failures here mean auth, not schema.
 */

type CreatedAuthUser = { id: string }

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

/** Delete an auth account when registration cannot safely finish after the auth
 *  user is created. */
export async function deleteAuthUser(authUserId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(authUserId)
  if (error) throw new Error(`data.authAccounts.deleteAuthUser: ${error.message}`)
}

/** Change the SIGNED-IN user's password via their own session. */
export async function updateOwnAuthPassword(password: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(`data.authAccounts.updateOwnPassword: ${error.message}`)
}

/** Revoke the signed-in user's OTHER sessions (every device/token except this one),
 *  through their own session. Called after a self-service credential change so a
 *  previously-captured session elsewhere cannot outlive the password it no longer knows
 *  (A-04). scope:'others' preserves the CURRENT session, so the user stays signed in on
 *  the device where they just made the change. */
export async function signOutOwnOtherSessions(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut({ scope: 'others' })
  if (error) throw new Error(`data.authAccounts.signOutOwnOtherSessions: ${error.message}`)
}

/** Ban or unban an auth account. A banned user is refused token refresh and new
 *  sign-in by GoTrue, so revoking an account cuts its LIVE session too - not only its
 *  data access, which RLS already blocks on status. Complements the profile/persona
 *  flip: without it a revoked user's existing token stays valid until it expires and
 *  any status-blind endpoint would still accept it (A-04). '876000h' (~100y) is an
 *  effectively-permanent ban; 'none' lifts it on restore. */
export async function setAuthUserBanned(authUserId: string, banned: boolean): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    ban_duration: banned ? '876000h' : 'none',
  })
  if (error) throw new Error(`data.authAccounts.setAuthUserBanned: ${error.message}`)
}

/** Change an auth account's email via the admin API, confirmed immediately so no
 *  Supabase confirmation email is sent (the app skips confirmation on create the
 *  same way, email_confirm: true). The profile row is synced by the caller. */
export async function updateAuthUserEmail(authUserId: string, email: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    email: email.trim().toLowerCase(),
    email_confirm: true,
  })
  if (error) throw new Error(`data.authAccounts.updateAuthUserEmail: ${error.message}`)
}
