import { claimAllowlistRowOnOAuth, selectAllowlistRowByEmail, selectProfileIdByAuthUserId } from '@/lib/data/profiles'
import { requiresGuardianConsent } from '@/lib/auth/minor'

/** The outcome of a first-login bind: the resolved profile id, and whether THIS call
 *  freshly activated a pending invite (so the caller can record consent, as password
 *  registration does). */
export type FirstLoginBinding = { profileId: string; activated: boolean }

/**
 * On first login, bind the authenticated user's id to their pre-created allowlist profile
 * (matched by email).
 *
 * A still-`pending` allowlist row is not only bound but ACTIVATED here (Google verified the
 * email), so an OAuth first login lands an ACTIVE account rather than a bound-but-pending one
 * whose setup code is now unusable (B-10). Returns null if the email isn't allowlisted, the
 * matching row is bound to a different user, or the (non-pending) row can't be claimed via
 * OAuth. Table access is in src/lib/data/profiles; the rules about WHICH row may be claimed
 * are here.
 */
export async function bindProfileOnFirstLogin(authUserId: string, email: string): Promise<FirstLoginBinding | null> {
  const alreadyBound = await selectProfileIdByAuthUserId(authUserId)
  if (alreadyBound) return { profileId: alreadyBound, activated: false }

  const row = await selectAllowlistRowByEmail(email)
  if (!row) return null
  // Already claimed: accept it only if this same user holds it (idempotent re-login); another
  // user's row is never re-pointed.
  if (row.auth_user_id) return row.auth_user_id === authUserId ? { profileId: row.id, activated: false } : null

  // A MINOR must not be activated via OAuth: Google sign-in captures no guardian consent, so
  // activating here would set up a minor's account with guardian_consent=false, bypassing the
  // password path's attestation (round-5 HIGH). Leave the invite pending so they register the
  // password way, where the guardian attestation is collected.
  if (requiresGuardianConsent(row)) return null

  // Unbound: claim AND activate the pending invite. Null if it wasn't pending (a revoked
  // invite is never OAuth-claimable) or a concurrent login won the race.
  const claimedId = await claimAllowlistRowOnOAuth(row.id, authUserId)
  return claimedId ? { profileId: claimedId, activated: true } : null
}
