import type { Profile } from '@/lib/auth/profile'
import type { Capability } from '@/lib/capabilities'
import { listClasses } from '@/lib/services/classes'
import { listClassTutors } from '@/lib/services/class-tutors'
import { listActiveByRole } from '@/lib/services/users'

export type CalendarPageData = {
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
  const canManage = caps.has('manageCalendar')
  const isAdmin = caps.has('manageAdminTier')

  if (!canManage) {
    return { canManage, isAdmin, classes: [], tutors: [] }
  }

  if (isAdmin) {
    // Assignable tutors = active tutors only (a disabled tutor must not be
    // offered as a slot owner). listActiveByRole filters status + role SQL-side
    // instead of pulling every profile and filtering in memory.
    const [allClasses, tutors] = await Promise.all([listClasses(), listActiveByRole('tutor')])
    return {
      canManage,
      isAdmin,
      classes: allClasses.filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name })),
      tutors,
    }
  }

  const [allClasses, myTeaching] = await Promise.all([listClasses(), listClassTutors()])
  const mine = new Set(myTeaching.filter((ct) => ct.tutor_id === profile.id).map((ct) => ct.class_id))
  return {
    canManage,
    isAdmin,
    classes: allClasses.filter((c) => c.status === 'active' && mine.has(c.id)).map((c) => ({ id: c.id, name: c.name })),
    tutors: [{ id: profile.id, name: profile.full_name ?? profile.email }],
  }
}
