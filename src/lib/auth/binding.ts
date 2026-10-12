import { claimAllowlistRowOnOAuth, selectAllowlistRowByEmail, selectProfileIdByAuthUserId } from '@/lib/data/profiles'
import { requiresGuardianConsent } from '@/lib/auth/minor'

/** The outcome of a first-login bind: the resolved profile id, and whether THIS call
 *  freshly activated a pending invite (so the caller can record consent, as password
 *  registration does). */
export type FirstLoginBinding = { profileId: string; activated: boolean }

/**
 * Why a first login could not be bound to an allowlist profile.
 *
 * These are kept APART because one of them has an answer the person can act on. A student
 * refused for `guardian_consent_required` has a working route - the setup code - and telling
 * them so is the difference between a signpost and a dead end. Collapsing every refusal into
 * one outcome is what left a student signed in to a session the app could not place, with
 * nothing on screen to say why.
 */
export type FirstLoginRefusal =
  /** No allowlist row for this email: nobody has added them. */
  | 'not_invited'
  /** The row is held by a different auth user. Never re-pointed. */
  | 'claimed_by_another'
  /** A minor. Google captures no guardian attestation, so the password path owns this. */
  | 'guardian_consent_required'
  /** Revoked, or a concurrent login claimed it first. */
  | 'not_claimable'

export type FirstLoginResult = FirstLoginBinding | { refused: FirstLoginRefusal }

/** Narrow a first-login result to a successful bind. */
export function isBound(result: FirstLoginResult): result is FirstLoginBinding {
  return 'profileId' in result
}

/**
 * On first login, bind the authenticated user's id to their pre-created allowlist profile
 * (matched by email).
 *
 * A still-`pending` allowlist row is not only bound but ACTIVATED here (Google verified the
 * email), so an OAuth first login lands an ACTIVE account rather than a bound-but-pending one
 * whose setup code is now unusable. Anything else comes back as a `refused` reason - see
 * FirstLoginRefusal for why the reasons are distinguished. Table access is in
 * src/lib/data/profiles; the rules about WHICH row may be claimed are here.
 */
export async function bindProfileOnFirstLogin(authUserId: string, email: string): Promise<FirstLoginResult> {
  const alreadyBound = await selectProfileIdByAuthUserId(authUserId)
  if (alreadyBound) return { profileId: alreadyBound, activated: false }

  const row = await selectAllowlistRowByEmail(email)
  if (!row) return { refused: 'not_invited' }
  // Already claimed: accept it only if this same user holds it (idempotent re-login); another
  // user's row is never re-pointed.
  if (row.auth_user_id) {
    return row.auth_user_id === authUserId ? { profileId: row.id, activated: false } : { refused: 'claimed_by_another' }
  }

  // A MINOR must not be activated via OAuth: Google sign-in captures no guardian consent, so
  // activating here would set up a minor's account with guardian_consent=false, bypassing the
  // password path's attestation (round-5 HIGH). Leave the invite pending so they register the
  // password way, where the guardian attestation is collected.
  if (requiresGuardianConsent(row)) return { refused: 'guardian_consent_required' }

  // Unbound: claim AND activate the pending invite. Refused if it wasn't pending (a revoked
  // invite is never OAuth-claimable) or a concurrent login won the race.
  const claimedId = await claimAllowlistRowOnOAuth(row.id, authUserId)
  return claimedId ? { profileId: claimedId, activated: true } : { refused: 'not_claimable' }
}
