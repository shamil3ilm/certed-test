import { redirect } from 'next/navigation'
import { getProfile, type Profile } from './profile'

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
