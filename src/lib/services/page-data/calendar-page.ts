import type { Profile } from '@/lib/auth/profile'
import type { Capability } from '@/lib/capabilities'
import { listClasses, listClassesByIds } from '@/lib/services/classes'
import { selectActiveClassIdsForTutor } from '@/lib/data/class-membership'
import { loadPersonaFlags } from '@/lib/permission/personas'
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
  const isAdmin = caps.has('manageAdminTier')
  // The current write layer for slots/events is still structural: admin or tutor
  // authority over a class, not a generic override-granted management persona.
  // Keep the management UI aligned with the live write paths so the page never
  // advertises controls this actor cannot actually use yet.
  const canManage = caps.has('manageCalendar') && (isAdmin || flags.isTutor)

  if (!canManage) {
    return { canManage, isAdmin, classes: [], tutors: [] }
  }

  if (isAdmin) {
    // Assignable teachers = active tutors plus dedicated mentors who may also
    // teach. Filter SQL-side instead of pulling every profile and filtering in memory.
    const [allClasses, tutors] = await Promise.all([listClasses(), listActiveTeacherCandidates()])
    return {
      canManage,
      isAdmin,
      classes: allClasses.filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name })),
      tutors,
    }
  }

  const myClasses = await listClassesByIds(await selectActiveClassIdsForTutor(profile.id))
  return {
    canManage,
    isAdmin,
    classes: myClasses.filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name })),
    tutors: [{ id: profile.id, name: profile.full_name ?? profile.email }],
  }
}
