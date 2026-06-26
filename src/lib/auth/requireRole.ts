import { redirect } from 'next/navigation'
import { getProfile, type Profile } from './profile'
import { assertRole } from './guards'

/**
 * Page/Server-Action guard: loads the caller's profile and enforces role +
 * active status, redirecting (not throwing) on failure. Returns the profile.
 */
export async function requireRole(allowed: Profile['role'][]): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')
  if (!allowed.includes(profile.role)) redirect('/dashboard')
  return profile
}

/**
 * API/Route-Handler guard: same checks, but throws coded errors
 * ('no-access' | 'revoked' | 'forbidden') instead of redirecting, so callers
 * can return a JSON error via `authFail`.
 */
export async function requireRoleApi(allowed: Profile['role'][]): Promise<Profile> {
  const profile = await getProfile()
  return assertRole(profile, allowed)
}
