import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import type { SelfProfileDetailsInput } from '@/lib/validation/user'
import { isMock } from '@/lib/mock/env'
import { RateLimitError, ValidationError } from '@/lib/errors'
import { rateLimit } from '@/lib/security/rate-limit'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { updateOwnProfile as updateOwnProfileRow, updateProfile } from '@/lib/data/profiles'
import { updateOwnAuthPassword, signOutOwnOtherSessions, updateAuthUserEmail } from '@/lib/data/auth-accounts'
import { logError } from '@/lib/observability/log'
import { getProfileByEmail } from './directory'

/** What a signed-in user may change about their OWN account. */

/** Self-service: the signed-in user edits their own name. The write goes through
 *  the request's client, so RLS scopes it to their own row. The patch type is
 *  deliberately narrowed to full_name only - class_level (grade) is admin-set, so
 *  the service can't be handed it even if a future caller forwarded it (the RLS
 *  own-row client would otherwise let a student rewrite their own class). */
export async function updateOwnProfile(
  actor: Pick<Profile, 'id'>,
  patch: { full_name?: string | null },
): Promise<void> {
  await updateOwnProfileRow(actor.id, patch)
  await auditPrivilegedAction(actor, 'profile.update', 'profile', actor.id)
}

/**
 * Self-service: the person completes their own SOFTER profile fields (contact, DOB,
 * and - for staff - qualifications/bio). Deliberately narrowed to
 * these: identity, class/grade, country, guardian and joined date are admin-owned, so
 * the RLS own-row client is never handed them here even if a caller forwarded them.
 * An empty field clears it (the settings form renders them all).
 */
export async function updateOwnProfileDetails(
  actor: Pick<Profile, 'id'>,
  patch: SelfProfileDetailsInput,
): Promise<void> {
  const nn = (v?: string) => (v && v.trim() ? v.trim() : null)
  await updateOwnProfileRow(actor.id, {
    phone: nn(patch.phone),
    date_of_birth: nn(patch.date_of_birth),
    qualifications: nn(patch.qualifications),
    bio: nn(patch.bio),
  })
  await auditPrivilegedAction(actor, 'profile.details', 'profile', actor.id)
}

/** Self-service password change. Real mode updates the auth account; mock mode
 * mirrors the password onto the seeded profile row used by the local auth shim. */
export async function changeOwnPassword(actor: Pick<Profile, 'id'>, password: string): Promise<void> {
  // Throttle this sensitive account-mutation path like every other write in the
  // app - a hijacked session shouldn't be able to hammer or lock the account.
  if (!rateLimit(`password-change:${actor.id}`, { limit: 5, windowMs: 10 * 60 * 1000 }).ok) {
    throw new RateLimitError('Too many password changes. Please wait a few minutes and try again.')
  }
  if (isMock()) {
    await updateProfile(actor.id, { password })
  } else {
    await updateOwnAuthPassword(password)
    // A-04: a password change must re-secure the account everywhere, not just here. Revoke
    // every OTHER session (keeping this one) so a previously-captured session on another
    // device can't outlive the password it no longer knows. Best-effort: the password IS
    // already changed, so a GoTrue hiccup here must not fail the whole change - log it.
    try {
      await signOutOwnOtherSessions()
    } catch (error) {
      logError('profile.password.signOutOthers', error)
    }
  }
  await auditPrivilegedAction(actor, 'profile.password', 'profile', actor.id)
}

/** Self-service email change. Like changeOwnPassword, an authenticated session is
 *  enough (no re-verification). Mock mirrors the new email onto the profile row the
 *  local auth shim signs in against; real mode updates the Supabase auth account
 *  AND the profile so sign-in (auth) and display/lookups (profiles) stay in sync. */
export async function changeOwnEmail(
  actor: Pick<Profile, 'id' | 'auth_user_id' | 'email'>,
  newEmail: string,
): Promise<void> {
  if (!rateLimit(`email-change:${actor.id}`, { limit: 5, windowMs: 10 * 60 * 1000 }).ok) {
    throw new RateLimitError('Too many email changes. Please wait a few minutes and try again.')
  }
  const email = newEmail.trim().toLowerCase()
  // No-op if unchanged, so a resubmit doesn't trip the "already in use" check.
  if (email === (actor.email ?? '').trim().toLowerCase()) return
  const existing = await getProfileByEmail(email)
  if (existing && existing.id !== actor.id) {
    throw new ValidationError('That email is already in use.')
  }
  if (isMock()) {
    await updateProfile(actor.id, { email })
  } else {
    // Auth first: if Supabase rejects (e.g. taken at the auth layer) the profile
    // row is left untouched, so the two never diverge on a failed change.
    if (actor.auth_user_id) await updateAuthUserEmail(actor.auth_user_id, email)
    await updateProfile(actor.id, { email })
  }
  await auditPrivilegedAction(actor, 'profile.email', 'profile', actor.id)
}
