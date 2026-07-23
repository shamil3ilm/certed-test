import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { isActiveClassTutor, isActiveEnrollee } from '@/lib/data/class-membership'
import { loadPersonaFlags } from './personas'

/** Can this user manage the class (roster + settings)? Admin, or a tutor of it. */
export async function canManageClass(profile: Profile, classId: string): Promise<boolean> {
  const { isAdmin, isTutor } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  if (!isTutor) return false
  return isActiveClassTutor(profile.id, classId)
}

/** Class-scoped manage rule for content that can also be academy-wide: a class
 *  action needs canManageClass; a global (null class_id) action is admin-only. */
export async function canManageScope(profile: Profile, classId: string | null): Promise<boolean> {
  if (classId === null) {
    const { isAdmin } = await loadPersonaFlags(profile.id)
    return isAdmin
  }
  return canManageClass(profile, classId)
}

/**
 * True if the caller may enter this class. Cached per-request: with `getProfile`
 * also cached, the layout and page pass the same profile ref + classId, so the
 * membership check runs once.
 */
export const canAccessClass = cache(async (profile: Profile, classId: string): Promise<boolean> => {
  const { isAdmin, isTutor, isStudent } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  if (isTutor) return isActiveClassTutor(profile.id, classId)
  if (isStudent) return isActiveEnrollee(profile.id, classId)
  return false
})
