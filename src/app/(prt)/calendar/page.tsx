import dynamic from 'next/dynamic'
import { requireCapability } from '@/lib/auth/require-role'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { getActorContext } from '@/lib/session/actor-context'
import { loadCalendarPageData } from '@/lib/services/page-data/calendar-page'
import { CalendarView } from './CalendarView'
import { PageHeader } from '@/lib/ui'

const TimetableManager = dynamic(() => import('./TimetableManager').then((mod) => mod.TimetableManager), {
  loading: () => <div className="mt-6 h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />,
})

export default async function CalendarPage() {
  // viewCalendar is held by every persona baseline (admin/sub_admin/tutor/mentor/
  // student), so the calendar is available to all active users; the guard still
  // enforces an active account and keeps the page in step with the nav.
  const me = await requireCapability('viewCalendar')

  // Resolved capabilities (persona baseline + overrides) drive the management
  // options, so an override honoured by the route is honoured in the view too.
  const actor = await getActorContext() // request-cached; already loaded by the header
  const [data, academyTz] = await Promise.all([
    loadCalendarPageData(me, actor.capabilities.allowed),
    getInstituteTimeZone(),
  ])

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader title="Calendar" />
      <CalendarView
        canManageCalendar={data.canManage}
        canManageContent={actor.capabilities.allowed.has('manageClassContent')}
        canCreateReminder={actor.capabilities.allowed.has('viewDashboard')}
        classes={data.classes}
        tutors={data.tutors}
        isAdmin={data.isAdmin}
      />
      {data.canManage && (
        <TimetableManager classes={data.classes} tutors={data.tutors} isAdmin={data.isAdmin} academyTz={academyTz} />
      )}
    </main>
  )
}
