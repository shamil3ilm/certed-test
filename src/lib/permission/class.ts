import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { isActiveClassTutor, isActiveEnrollee, selectActiveClassIdsForStudents } from '@/lib/data/class-membership'
import { selectActiveMenteeIds } from '@/lib/data/mentorships'
import { selectClassStatus } from '@/lib/data/classes'
import { ValidationError } from '@/lib/errors'
import { loadPersonaFlags } from './personas'

/**
 * Classes a mentor holds tutor-level authority over: the classes their active
 * mentees are enrolled in. A mentor is teaching staff scoped to their mentees,
 * so they get a tutor's class powers here (and only here) - never academy-wide.
 * Empty for a non-mentor or a mentor whose mentees are in no active class.
 * Request-cached, so the mentee->class lookup runs once per request.
 */
export const mentorAuthorityClassIds = cache(async (profileId: string): Promise<ReadonlySet<string>> => {
  const menteeIds = await selectActiveMenteeIds(profileId)
  if (menteeIds.length === 0) return new Set<string>()
  return new Set(await selectActiveClassIdsForStudents(menteeIds))
})

/** Can this user manage the class (roster + settings)? Admin, a tutor of it, or a
 *  mentor of a student enrolled in it. */
export async function canManageClass(profile: Pick<Profile, 'id'>, classId: string): Promise<boolean> {
  const { isAdmin, isTutor, hasMentorAuthority } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  const [teaches, mentors] = await Promise.all([
    isTutor ? isActiveClassTutor(profile.id, classId) : Promise.resolve(false),
    hasMentorAuthority ? mentorAuthorityClassIds(profile.id).then((ids) => ids.has(classId)) : Promise.resolve(false),
  ])
  return teaches || mentors
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
export async function canManageScope(profile: Pick<Profile, 'id'>, classId: string | null): Promise<boolean> {
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
export const canAccessClass = cache(async (profile: Pick<Profile, 'id'>, classId: string): Promise<boolean> => {
  const { isAdmin, isTutor, isStudent, hasMentorAuthority } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  const [teaches, enrolled, mentors] = await Promise.all([
    isTutor ? isActiveClassTutor(profile.id, classId) : Promise.resolve(false),
    isStudent ? isActiveEnrollee(profile.id, classId) : Promise.resolve(false),
    hasMentorAuthority ? mentorAuthorityClassIds(profile.id).then((ids) => ids.has(classId)) : Promise.resolve(false),
  ])
  return teaches || enrolled || mentors
})
