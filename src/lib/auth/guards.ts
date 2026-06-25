import type { Profile } from './profile'

/**
 * Asserts the profile is allowlisted, active, and has one of the allowed roles.
 * Throws a coded Error otherwise: 'no-access' | 'revoked' | 'forbidden'.
 * Returns the profile (narrowed) when it passes.
 */
export function assertRole(profile: Profile | null, allowed: Profile['role'][]): Profile {
  if (!profile) throw new Error('no-access')
  if (profile.status === 'disabled') throw new Error('revoked')
  if (profile.status !== 'active') throw new Error('no-access')
  if (!allowed.includes(profile.role)) throw new Error('forbidden')
  return profile
}
