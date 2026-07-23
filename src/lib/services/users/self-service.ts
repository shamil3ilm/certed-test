import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { isMock } from '@/lib/mock/env'
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
  if (isMock()) {
    await updateProfile(actor.id, { password })
  } else {
    await updateOwnAuthPassword(password)
  }
  await auditPrivilegedAction(actor, 'profile.password', 'profile', actor.id)
}
