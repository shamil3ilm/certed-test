import {
  bindAuthUserIdIfUnbound,
  selectAllowlistRowByEmail,
  selectProfileIdByAuthUserId,
} from '@/lib/data/profiles'

/**
 * On first login, bind the authenticated user's id to their pre-created
 * allowlist profile (matched by email).
 *
 * Returns the bound profile id, or null if the email isn't allowlisted (or the
 * matching row is already bound to a different user). Table access is in
 * src/lib/data/profiles; the rules about WHICH row may be claimed are here.
 */
export async function bindProfileOnFirstLogin(authUserId: string, email: string): Promise<string | null> {
  const alreadyBound = await selectProfileIdByAuthUserId(authUserId)
  if (alreadyBound) return alreadyBound

  const row = await selectAllowlistRowByEmail(email)
  if (!row) return null
  // Already claimed: return it only if this same user holds it, so a second
  // login is idempotent while another user's row is never re-pointed.
  if (row.auth_user_id) return row.auth_user_id === authUserId ? row.id : null

  return bindAuthUserIdIfUnbound(row.id, authUserId)
}
