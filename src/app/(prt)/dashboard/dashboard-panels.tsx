import Link from 'next/link'
import { Suspense } from 'react'
import type { CalendarEvent } from '@/lib/services/calendar-events'
import type {
  AdminDashboardViewData,
  DashboardMentee,
  SubAdminDashboardViewData,
} from '@/lib/services/page-data/dashboard'
import { usersUrl } from '@/lib/services/page-data/admin-users'
import { Avatar, Card, ListRow, MiniBars, Panel, StatGrid } from '@/lib/ui'
import { StatModalCard } from '../StatModalCard'
import type { Profile } from '@/lib/auth/profile'
import { AdminAnalyticsStats } from './analytics-stats'
import { DashboardChartsSection } from './charts-section'
import { DashboardSection } from './dashboard-layout'
import { WidgetSkeleton } from './widgets'
import { ReminderPanel } from './ReminderPanel'
import { WIDGET_CTA_LINK, WIDGET_ROW_META, WIDGET_ROW_STACK } from './widget-shared'
import {
  loadActiveClassesModal,
  loadFinanceModal,
  loadPendingModal,
  loadStudentsModal,
  loadTutorsModal,
} from './modal-actions'

export function MenteesPanel({ mentees }: { mentees: DashboardMentee[] }) {
  return (
    <DashboardSection>
      <Panel title="Mentee roster">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            Students you look after across subjects. Open one to review their overall progress.
          </p>
          <Link href="/my-hours#mentees" className={WIDGET_CTA_LINK}>
            Mentee hours &rarr;
          </Link>
        </div>
        {mentees.length === 0 ? (
          <p className="text-sm text-slate-600">No mentees assigned yet - an admin will assign them.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {mentees.map((mentee) => (
              // min-w-0: a grid item defaults to min-width:auto and won't shrink
              // below the row's content width, so the ListRow's own truncate can't
              // engage and a long name overflows the 320px viewport. Let it shrink.
              <li key={mentee.id} className="min-w-0">
                <ListRow
                  href={`/students/${mentee.id}`}
                  leading={<Avatar name={mentee.name} role="student" />}
                  title={mentee.name}
                  subtitle={mentee.subtitle}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </DashboardSection>
  )
}

/** Shared modal stat cards for academy roster totals (Students, Tutors & Mentors). */
export function CoreUserStatCards({ students, tutors }: { students: number; tutors: number }) {
  return (
    <>
      <StatModalCard
        key="students"
        label="Students"
        value={students}
        title="Students"
        load={loadStudentsModal}
        viewAllHref={usersUrl({ tab: 'people', role: 'student' })}
        empty="No students yet."
      />
      <StatModalCard
        key="tutors"
        label="Tutors & Mentors"
        value={tutors}
        title="Tutors & Mentors"
        load={loadTutorsModal}
        viewAllHref={usersUrl({ tab: 'people', role: 'staff' })}
        empty="No tutors yet."
      />
    </>
  )
}

export function SubAdminOverview({
  data,
  canViewUsers,
  canManageUsers,
  canManageMentorships,
  canManageClasses = false,
}: {
  data: SubAdminDashboardViewData
  canViewUsers: boolean
  canManageUsers: boolean
  canManageMentorships: boolean
  canManageClasses?: boolean
}) {
  if (!canViewUsers) {
    return (
      <CapabilityNotice message="User-management widgets are hidden because this account does not currently have user access." />
    )
  }

  return (
    <>
      <StatGrid cols={3} className="mt-6">
        <CoreUserStatCards students={data.students} tutors={data.tutors} />
        <StatModalCard
          label="Pending access"
          value={data.pending}
          title="Pending access"
          tone={data.pending > 0 ? 'primary' : undefined}
          load={loadPendingModal}
          viewAllHref={usersUrl({ tab: 'people', status: 'pending' })}
          empty="Nobody waiting for access."
        />
      </StatGrid>
      <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">User management</h2>
          <p className="mt-1 text-sm text-slate-600">
            {canManageUsers && canManageMentorships
              ? 'Add, edit or revoke students and tutors, and assign mentors.'
              : canManageUsers
                ? 'Add, edit or revoke students and tutors.'
                : canManageMentorships
                  ? 'Review users and assign mentors.'
                  : 'Add, edit or revoke students and tutors.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canManageClasses && (
            <Link href="/admin/teaching-hours" className="btn btn-soft">
              Class hours
            </Link>
          )}
          <Link href="/admin/users" className="btn btn-primary">
            {canManageUsers ? 'Manage users' : 'View users'}
          </Link>
        </div>
      </Card>
      <DashboardSection className="grid gap-4 lg:grid-cols-2">
        <UpcomingPanel events={data.upcoming} />
        <ReminderPanel initialReminders={data.reminders} initialPastReminders={data.pastReminders} now={data.now} />
      </DashboardSection>
    </>
  )
}

export function AdminOverview({ data, me }: { data: AdminDashboardViewData; me: Profile }) {
  const statCards = [
    data.peopleCounts ? (
      <StatModalCard
        key="students"
        label="Students"
        value={data.peopleCounts.students}
        title="Students"
        load={loadStudentsModal}
        viewAllHref={usersUrl({ tab: 'people', role: 'student' })}
      />
    ) : null,
    data.peopleCounts ? (
      <StatModalCard
        key="tutors"
        label="Tutors & Mentors"
        value={data.peopleCounts.tutors}
        title="Tutors & Mentors"
        load={loadTutorsModal}
        viewAllHref={usersUrl({ tab: 'people', role: 'staff' })}
      />
    ) : null,
    <StatModalCard
      key="classes"
      label="Active classes"
      value={data.activeClassCount}
      title="Active classes"
      load={loadActiveClassesModal}
      viewAllHref="/classroom"
    />,
    data.netLabel ? (
      <StatModalCard
        key="finance"
        label="Net"
        value={data.netLabel}
        sub={`${data.revenueLabel ?? '-'} in - ${data.payoutLabel ?? '-'} out${
          data.financeUnconverted ? ` - ${data.financeUnconverted} not yet converted` : ''
        }`}
        tone="primary"
        title="Finance"
        load={loadFinanceModal}
        viewAllHref="/admin/finance"
        empty="None yet."
      />
    ) : null,
  ].filter(Boolean)

  return (
    <>
      <StatGrid cols={4} className="mt-6">
        {statCards}
      </StatGrid>
      <DashboardSection>
        <Suspense fallback={<WidgetSkeleton />}>
          <AdminAnalyticsStats pendingAccess={data.peopleCounts?.pending ?? 0} me={me} />
        </Suspense>
      </DashboardSection>
      <DashboardSection className="grid gap-4 lg:grid-cols-3">
        <Panel title="Students per class">
          <MiniBars data={data.perClass} />
          <Link href="/classroom" className={WIDGET_CTA_LINK}>
            Open classes &rarr;
          </Link>
        </Panel>
        <UpcomingPanel events={data.upcoming} />
        <ReminderPanel initialReminders={data.reminders} initialPastReminders={data.pastReminders} now={data.now} />
      </DashboardSection>
      <DashboardChartsSection me={me} />
    </>
  )
}

export function CapabilityNotice({ message }: { message: string }) {
  return (
    <Card className="mt-6 p-5">
      <h2 className="text-sm font-semibold text-slate-800">Dashboard access is limited</h2>
      <p className="mt-1 text-sm text-slate-600">{message}</p>
    </Card>
  )
}

function Upcoming({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-600">Nothing scheduled.</p>

  return (
    <ul className="space-y-1 text-sm">
      {events.map((event) => (
        <li key={event.id}>
          <Link href="/calendar" className={WIDGET_ROW_STACK}>
            <span className="w-full truncate" title={event.title}>
              {event.title}
            </span>
            <span className={WIDGET_ROW_META}>
              {event.event_date} - {event.kind}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function UpcomingPanel({ events }: { events: CalendarEvent[] }) {
  return (
    <Panel title="Upcoming">
      <Upcoming events={events} />
    </Panel>
  )
}
