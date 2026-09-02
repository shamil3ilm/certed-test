import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { isActiveClassTutor, isActiveEnrollee, selectActiveClassIdsForStudents } from '@/lib/data/class-membership'
import { selectScopedMenteeIds } from '@/lib/data/personas'
import { selectClassStatus } from '@/lib/data/classes'
import { selectActiveGlobalOverrides } from '@/lib/data/capability-overrides'
import { resolveCapabilities, type CapabilityOverride } from '@/lib/capabilities'
import { ValidationError } from '@/lib/errors'
import { loadPersonaFlags } from './personas'

/**
 * Classes a mentor holds tutor-level authority over: the classes their active
 * mentees are enrolled in. A mentor is teaching staff scoped to their mentees,
 * so they get a tutor's class powers here (and only here) - never academy-wide.
 * Empty for a non-mentor or a mentor whose mentees are in no active class.
 * Request-cached, so the mentee->class lookup runs once per request.
 *
 * Mentee ids come from the scoped-persona source (selectScopedMenteeIds) - the
 * SAME row canMentor authorizes against - not the mentorships link table. This
 * keeps class authority in step with per-student data access: removeMentor drops
 * the persona first, so if its second write fails, this and canMentor fail closed
 * together rather than leaving a "removed" mentor with lingering class powers.
 */
export const mentorAuthorityClassIds = cache(async (profileId: string): Promise<ReadonlySet<string>> => {
  const menteeIds = await selectScopedMenteeIds(profileId)
  if (menteeIds.length === 0) return new Set<string>()
  return new Set(await selectActiveClassIdsForStudents(menteeIds))
})

/** Can this user manage the class (roster + settings)? An academy-wide class admin
 *  (admin or sub_admin - anyone with manageClasses), a tutor of it, or a mentor of a
 *  student enrolled in it. */
export async function canManageClass(profile: Pick<Profile, 'id'>, classId: string): Promise<boolean> {
  const flags = await loadPersonaFlags(profile.id)
  if (flags.isAdmin) return true
  // Academy-wide class authority (manageClasses) can be DENIED via an admin override,
  // and isClassAdmin (the persona baseline alone) does not see that deny. Resolve the
  // effective set here (baseline minus deny overrides) and gate on that, so a denied
  // capability actually stops the class operations it gates.
  const resolved = resolveCapabilities({
    personas: flags.personas,
    overrides: (await selectActiveGlobalOverrides(profile.id)) as CapabilityOverride[],
  })
  if (resolved.allowed.has('manageClasses')) return true
  const [teaches, mentors] = await Promise.all([
    flags.isTutor ? isActiveClassTutor(profile.id, classId) : Promise.resolve(false),
    flags.hasMentorAuthority
      ? mentorAuthorityClassIds(profile.id).then((ids) => ids.has(classId))
      : Promise.resolve(false),
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
