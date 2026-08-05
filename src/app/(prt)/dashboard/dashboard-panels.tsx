import Link from 'next/link'
import { Suspense } from 'react'
import type { CalendarEvent } from '@/lib/services/calendar-events'
import type {
  AdminDashboardViewData,
  DashboardMentee,
  SubAdminDashboardViewData,
} from '@/lib/services/page-data/dashboard'
import { Avatar, Card, ListRow, MiniBars, Panel, StatGrid } from '@/lib/ui'
import { StatModalCard } from '../StatModalCard'
import type { Profile } from '@/lib/auth/profile'
import { AdminAnalyticsStats } from './analytics-stats'
import { DashboardChartsSection } from './charts-section'
import { WidgetSkeleton } from './widgets'
import { ReminderPanel } from './ReminderPanel'
import { WIDGET_CTA_LINK, WIDGET_ROW_LINK, WIDGET_ROW_META } from './widget-shared'
import {
  loadActiveClassesModal,
  loadFinanceModal,
  loadPendingModal,
  loadStudentsModal,
  loadTutorsModal,
} from './modal-actions'

export function MenteesPanel({ mentees }: { mentees: DashboardMentee[] }) {
  return (
    <section className="mt-6">
      <Panel title="Your mentees">
        <p className="mb-3 text-sm text-slate-500">
          Students you look after across subjects. Open one to review their overall progress.
        </p>
        {mentees.length === 0 ? (
          <p className="text-sm text-slate-400">
            No mentees assigned yet - an admin will add students for you to mentor.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {mentees.map((mentee) => (
              <li key={mentee.id}>
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
    </section>
  )
}

export function SubAdminOverview({
  data,
  canViewUsers,
  canManageUsers,
  canManageMentorships,
}: {
  data: SubAdminDashboardViewData
  canViewUsers: boolean
  canManageUsers: boolean
  canManageMentorships: boolean
}) {
  if (!canViewUsers) {
    return (
      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold text-slate-800">Dashboard access is limited</h2>
        <p className="mt-1 text-sm text-slate-500">
          User-management widgets are hidden because this account does not currently have user access.
        </p>
      </Card>
    )
  }

  return (
    <>
      <StatGrid cols={3} className="mt-6">
        <StatModalCard
          label="Students"
          value={data.students}
          title="Students"
          load={loadStudentsModal}
          viewAllHref="/admin/users?tab=students"
          empty="No students yet."
        />
        <StatModalCard
          label="Tutors & mentors"
          value={data.tutors}
          title="Tutors & mentors"
          load={loadTutorsModal}
          viewAllHref="/admin/users?tab=tutors"
          empty="No tutors yet."
        />
        <StatModalCard
          label="Pending access"
          value={data.pending}
          title="Pending access"
          tone={data.pending > 0 ? 'primary' : undefined}
          load={loadPendingModal}
          viewAllHref="/admin/users?status=pending"
          empty="Nobody waiting for access."
        />
      </StatGrid>
      <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">User management</h2>
          <p className="mt-1 text-sm text-slate-500">
            {canManageUsers && canManageMentorships
              ? 'Add, edit or revoke students and tutors, and assign mentors.'
              : canManageUsers
                ? 'Add, edit or revoke students and tutors.'
                : canManageMentorships
                  ? 'Review users and assign mentors.'
                  : 'Add, edit or revoke students and tutors.'}
          </p>
        </div>
        <Link href="/admin/users" className="btn btn-primary shrink-0">
          {canManageUsers ? 'Manage users' : 'View users'}
        </Link>
      </Card>
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
        viewAllHref="/admin/users?tab=students"
      />
    ) : null,
    data.peopleCounts ? (
      <StatModalCard
        key="tutors"
        label="Tutors & mentors"
        value={data.peopleCounts.tutors}
        title="Tutors & mentors"
        load={loadTutorsModal}
        viewAllHref="/admin/users?tab=tutors"
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
        sub={`${data.revenueLabel ?? '-'} in - ${data.payoutLabel ?? '-'} out`}
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
      <section className="mt-6">
        <Suspense fallback={<WidgetSkeleton />}>
          <AdminAnalyticsStats />
        </Suspense>
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Students per class">
          <MiniBars data={data.perClass} />
          <Link href="/classroom" className={WIDGET_CTA_LINK}>
            Open classes &rarr;
          </Link>
        </Panel>
        <Panel title="Upcoming">
          <Upcoming events={data.upcoming} />
        </Panel>
        <ReminderPanel initialReminders={data.reminders} initialPastReminders={data.pastReminders} now={data.now} />
      </section>
      <DashboardChartsSection me={me} />
    </>
  )
}

export function CapabilityNotice({ message }: { message: string }) {
  return (
    <Card className="mt-6 p-5">
      <h2 className="text-sm font-semibold text-slate-800">Dashboard access is limited</h2>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
    </Card>
  )
}

function Upcoming({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-400">Nothing scheduled.</p>

  return (
    <ul className="space-y-1 text-sm">
      {events.map((event) => (
        <li key={event.id}>
          <a href="/calendar" className={WIDGET_ROW_LINK}>
            <span className="min-w-0 truncate">{event.title}</span>
            <span className={WIDGET_ROW_META}>
              {event.event_date} - {event.kind}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
