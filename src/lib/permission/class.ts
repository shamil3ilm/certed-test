import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { isActiveClassTutor, isActiveEnrollee, selectActiveClassIdsForStudents } from '@/lib/data/class-membership'
import { selectScopedMenteeIds } from '@/lib/data/personas'
import { selectClassStatus } from '@/lib/data/classes'
import { selectActiveGlobalOverrides } from '@/lib/data/capability-overrides'
import { resolveCapabilities, type CapabilityOverride } from '@/lib/capabilities'
import { ValidationError } from '@/lib/errors'
import { loadPersonaFlags } from './personas'
import { selectActiveClassIds, selectActiveClassIdsAmong } from '@/lib/data/classes'

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
/**
 * The classes a mentoring-surface reader may review: their mentees' classes, or EVERY
 * active class for an oversight actor.
 *
 * "Oversight" is `!hasMentorAuthority` - the same test getMenteeListView makes, and the
 * single place it is now decided. Every mentoring surface is gated on `viewMentees`, so
 * its readers are mentors, sub-admins and admins; the ones without mentor authority are
 * exactly the oversight tier.
 *
 * This exists because the definition had drifted. /students used `!hasMentorAuthority` and
 * showed a sub_admin every mentored student, while /session-timings used `isAdmin` and
 * showed it nothing - so the same persona was "oversight" on one page and not on the next,
 * and the resulting blank page looked like an intentional narrowing. One predicate, one
 * answer, and the two pages describe the same population again.
 */
export async function mentoringScopeClassIds(profile: Pick<Profile, 'id'>): Promise<string[]> {
  // Archived classes drop out of every operational mentoring view (Q7).
  if (await isMentoringOversight(profile.id)) return selectActiveClassIds()
  return selectActiveClassIdsAmong([...(await mentorAuthorityClassIds(profile.id))])
}

/**
 * Is this actor an OVERSIGHT reader of the mentoring surfaces, rather than a mentor
 * looking at their own mentees?
 *
 * Every mentoring surface is gated on `viewMentees`, so its readers are mentors,
 * sub-admins and admins; the ones WITHOUT mentor authority are exactly the oversight tier.
 * The definition lived in two places and disagreed - /students asked `!hasMentorAuthority`
 * and /session-timings asked `isAdmin`, which silently dropped the sub_admin: it holds
 * viewMentees but mentors nobody, so it fell into neither branch and got an empty page
 * while /students showed it the whole academy.
 *
 * Scope: this decides who reads CLASS-SCOPED data, and it matches RLS because 0092 widened
 * `teaches_class()` to sub_admin. It is NOT a general "admin tier" predicate - do not reach
 * for it on a surface whose policy gates on `is_active_admin()` (mentee_notes is the one
 * such surface today), or the app becomes looser than the database.
 */
export async function isMentoringOversight(profileId: string): Promise<boolean> {
  const { hasMentorAuthority } = await loadPersonaFlags(profileId)
  return !hasMentorAuthority
}

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
  const { isAdmin, isSubAdmin, isTutor, isStudent, hasMentorAuthority } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  // A sub_admin oversees every class (0092 widens the DB class scope to match).
  if (isSubAdmin) return true
  const [teaches, enrolled, mentors] = await Promise.all([
    isTutor ? isActiveClassTutor(profile.id, classId) : Promise.resolve(false),
    isStudent ? isActiveEnrollee(profile.id, classId) : Promise.resolve(false),
    hasMentorAuthority ? mentorAuthorityClassIds(profile.id).then((ids) => ids.has(classId)) : Promise.resolve(false),
  ])
  return teaches || enrolled || mentors
})
