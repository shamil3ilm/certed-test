import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import { loadCalendarPageData } from '@/lib/services/page-data/calendar-page'
import { CalendarView } from './CalendarView'
import { TimetableManager } from './TimetableManager'
import { PageHeader } from '@/lib/ui'

export default async function CalendarPage() {
  // viewCalendar (admin/tutor/student) - matches the nav. The prior active-only
  // check let a sub_admin (no viewCalendar) reach this page by direct URL.
  const me = await requireCapability('viewCalendar')

  // Resolved capabilities (persona baseline + overrides) drive the management
  // options, so an override honoured by the route is honoured in the view too.
  const actor = await getActorContext() // request-cached; already loaded by the header
  const data = await loadCalendarPageData(me, actor.capabilities.allowed)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader title="Calendar" />
      <CalendarView canManage={data.canManage} classes={data.classes} isAdmin={data.isAdmin} />
      {data.canManage && <TimetableManager classes={data.classes} tutors={data.tutors} isAdmin={data.isAdmin} />}
    </main>
  )
}
