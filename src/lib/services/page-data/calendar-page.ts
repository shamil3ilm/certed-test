import type { Profile } from '@/lib/auth/profile'
import { hasCapability, isAdminTier } from '@/lib/capabilities'
import { listClasses } from '@/lib/services/classes'
import { listClassTutors } from '@/lib/services/class-tutors'
import { listActiveByRole } from '@/lib/services/users'

export type CalendarPageData = {
  canManage: boolean
  isAdmin: boolean
  classes: { id: string; name: string }[]
  tutors: { id: string; name: string }[]
}

/** Shapes the calendar/timetable management options for the signed-in actor. */
export async function loadCalendarPageData(profile: Profile): Promise<CalendarPageData> {
  const canManage = hasCapability(profile, 'manageCalendar')
  const isAdmin = isAdminTier(profile)

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
    classes: allClasses
      .filter((c) => c.status === 'active' && mine.has(c.id))
      .map((c) => ({ id: c.id, name: c.name })),
    tutors: [{ id: profile.id, name: profile.full_name ?? profile.email }],
  }
}
