import type { Profile } from '@/lib/auth/profile'
import type { Capability } from '@/lib/capabilities'
import { listClasses, listClassesByIds, myClassIds } from '@/lib/services/classes'
import { selectActiveClassIdsForTutor } from '@/lib/data/class-membership'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { mentorAuthorityClassIds } from '@/lib/permission/class'
import { listActiveTeacherCandidates } from '@/lib/services/users'

type CalendarPageData = {
  canManage: boolean
  isAdmin: boolean
  classes: { id: string; name: string }[]
  tutors: { id: string; name: string }[]
}

/**
 * Shapes the calendar/timetable management options for the signed-in actor.
 * Decides against the actor's RESOLVED capabilities (persona baseline + admin
 * overrides), not Profile.role - so an override granting manageCalendar opens
 * the management UI here exactly as it opens the route. `manageAdminTier` is a
 * hard rule (never override-granted), so it still reflects the true admin tier.
 */
export async function loadCalendarPageData(profile: Profile, caps: ReadonlySet<Capability>): Promise<CalendarPageData> {
  const flags = await loadPersonaFlags(profile.id)
  // "Admin" here means academy-wide class authority - admin-tier OR a sub_admin holding
  // manageClasses - which drives the all-classes view and the academy-wide event option.
  const isAdmin = caps.has('manageAdminTier') || flags.isClassAdmin
  // Class write authority is structural: admin, a tutor of a class, or a mentor of
  // a student in it (canManageClass / canWriteClass enforce the same scoping). Keep
  // the management UI aligned with those write paths so the page never advertises
  // controls this actor cannot actually use. Short-circuit on the capability first,
  // so a read-only actor never depends on the persona flags.
  const canManageContent = caps.has('manageClassContent') && (isAdmin || flags.isTutor || flags.hasMentorAuthority)
  const canManage = caps.has('manageCalendar') && (isAdmin || flags.isTutor || flags.hasMentorAuthority)

  if (isAdmin) {
    const tasks: [
      Promise<Awaited<ReturnType<typeof listClasses>>>,
      Promise<Awaited<ReturnType<typeof listActiveTeacherCandidates>>>,
    ] = [listClasses(), canManage || canManageContent ? listActiveTeacherCandidates() : Promise.resolve([])]
    // Assignable teachers = active tutors plus dedicated mentors who may also
    // teach. Filter SQL-side instead of pulling every profile and filtering in memory.
    const [allClasses, tutors] = await Promise.all(tasks)
    return {
      canManage,
      isAdmin,
      classes: allClasses.filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name })),
      tutors,
    }
  }

  let visibleClassIds: string[]
  if (canManage || canManageContent) {
    // Manageable classes = classes this actor teaches PLUS (for a mentor) the
    // classes their mentees are enrolled in.
    const [tutorClassIds, mentorClassIds] = await Promise.all([
      selectActiveClassIdsForTutor(profile.id),
      flags.hasMentorAuthority ? mentorAuthorityClassIds(profile.id) : Promise.resolve(new Set<string>()),
    ])
    visibleClassIds = [...new Set([...tutorClassIds, ...mentorClassIds])]
  } else {
    visibleClassIds = await myClassIds(profile)
  }
  if (visibleClassIds.length === 0) {
    return {
      canManage,
      isAdmin,
      classes: [],
      tutors: canManage || canManageContent ? [{ id: profile.id, name: profile.full_name ?? profile.email }] : [],
    }
  }
  const myClasses = await listClassesByIds(visibleClassIds)
  return {
    canManage,
    isAdmin,
    classes: myClasses.filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name })),
    tutors: canManage || canManageContent ? [{ id: profile.id, name: profile.full_name ?? profile.email }] : [],
  }
}
