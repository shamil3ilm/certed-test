import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { isActiveClassTutor, isActiveEnrollee } from '@/lib/data/class-membership'
import { selectClassStatus } from '@/lib/data/classes'
import { ValidationError } from '@/lib/errors'
import { loadPersonaFlags } from './personas'

/** Can this user manage the class (roster + settings)? Admin, or a tutor of it. */
export async function canManageClass(profile: Profile, classId: string): Promise<boolean> {
  const { isAdmin, isTutor } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  if (!isTutor) return false
  return isActiveClassTutor(profile.id, classId)
}

/**
 * Business-rule guard (not authorization): reject writes that would add content
 * to an ARCHIVED (soft-deleted) class. enrolStudent/addTutor already do this;
 * this shared guard lets the content-create paths (assignment / announcement /
 * resource / meet link / slot / event) do the same, so a tutor who still holds
 * class_tutors membership can't POST active content onto a hidden class. Callers
 * pass a NON-null class_id - a global (null) item has no class to be archived.
 */
export async function assertClassActive(classId: string): Promise<void> {
  if ((await selectClassStatus(classId)) !== 'active') {
    throw new ValidationError('That class is archived - restore it before adding content.')
  }
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
