import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { isMock } from '@/lib/mock/env'
import { RateLimitError } from '@/lib/errors'
import { rateLimit } from '@/lib/security/rate-limit'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { updateOwnProfile as updateOwnProfileRow, updateProfile } from '@/lib/data/profiles'
import { updateOwnAuthPassword } from '@/lib/data/auth-accounts'

/** What a signed-in user may change about their OWN account. */

/** Self-service: the signed-in user edits their own name / class. The write goes
 *  through the request's client, so RLS scopes it to their own row. */
export async function updateOwnProfile(
  actor: Pick<Profile, 'id'>,
  patch: { full_name?: string | null; class_level?: string | null },
): Promise<void> {
  await updateOwnProfileRow(actor.id, patch)
  await auditPrivilegedAction(actor, 'profile.update', 'profile', actor.id)
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
  }
  await auditPrivilegedAction(actor, 'profile.password', 'profile', actor.id)
}
