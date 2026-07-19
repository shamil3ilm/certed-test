import { Suspense } from 'react'
import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import type { Profile } from '@/lib/auth/profile'
import {
  type AdminDashboardViewData,
  type DashboardMentee,
  loadDashboardMentees,
  loadDashboardViewData,
  type SubAdminDashboardViewData,
} from '@/lib/services/page-data/dashboard'
import { type CalendarEvent } from '@/lib/services/calendar-events'
import { Panel, MiniBars, Card, Avatar, CARD, cx, personaLabel } from '../ui'
import { StatModalCard } from '../StatModalCard'
import { ReminderPanel } from './ReminderPanel'
import {
  loadStudentsModal,
  loadTutorsModal,
  loadPendingModal,
  loadActiveClassesModal,
  loadFinanceModal,
} from './modal-actions'
import {
  WidgetSkeleton,
  TodaysClassesWidget,
  AttendanceRateWidget,
  LatestGradeWidget,
  LatestAnnouncementWidget,
  PendingAttendanceWidget,
  MeetingLinksWidget,
  RecentUploadsWidget,
} from './widgets'

export default async function Dashboard() {
  // Entry page: guarded by the capability, not a fixed role list, so the guard
  // stays in step with the capability-driven nav and with any persona (now or
  // future) that legitimately holds viewDashboard.
  const me = await requireCapability('viewDashboard')
  const actor = await getActorContext() // request-cached; already loaded by the header
  const [data, mentees] = await Promise.all([loadDashboardViewData(me), loadDashboardMentees(me)])

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-5 text-white shadow-sm sm:p-6 lg:p-8">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
          Welcome, {me.full_name ?? me.email}
        </h1>
        <p className="mt-1 text-sm text-white/80">{personaLabel(actor.personas)} - Cert-Ed Academia portal</p>
      </div>

      {data.kind === 'admin' && <AdminDashboard data={data} />}
      {data.kind === 'sub_admin' && <SubAdminDashboard data={data} />}
      {data.kind === 'tutor' && <TutorDashboard me={me} />}
      {data.kind === 'student' && <StudentDashboard me={me} />}

      {mentees.length > 0 && <MenteesPanel mentees={mentees} />}
    </main>
  )
}

/** Shown to anyone who personally mentors students, regardless of their view-kind
 *  — surfaces a mentor's actual work even when their teaching dashboard is empty. */
function MenteesPanel({ mentees }: { mentees: DashboardMentee[] }) {
  return (
    <section className="mt-6">
      <Panel title="Your mentees">
        <p className="mb-3 text-sm text-slate-500">
          Students you look after across subjects. Open one to review their overall progress.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {mentees.map((mentee) => (
            <li key={mentee.id}>
              <Link
                href={`/students/${mentee.id}`}
                className={cx(CARD, 'group flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:shadow-md')}
              >
                <Avatar name={mentee.name} role="student" />
                <span className="text-sm font-medium text-slate-800">{mentee.name}</span>
                <span className="ml-auto text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">
                  View -&gt;
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  )
}

function SubAdminDashboard({ data }: { data: SubAdminDashboardViewData }) {
  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatModalCard
          label="Students"
          value={data.students}
          title="Students"
          load={loadStudentsModal}
          empty="No students yet."
        />
        <StatModalCard
          label="Tutors"
          value={data.tutors}
          title="Tutors"
          load={loadTutorsModal}
          empty="No tutors yet."
        />
        <StatModalCard
          label="Pending access"
          value={data.pending}
          title="Pending access"
          tone={data.pending > 0 ? 'primary' : undefined}
          load={loadPendingModal}
          empty="Nobody waiting for access."
        />
      </section>
      <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">User management</h2>
          <p className="mt-1 text-sm text-slate-500">
            Add, edit or revoke students and tutors, and assign mentors.
          </p>
        </div>
        <a href="/admin/users" className="btn btn-primary shrink-0">
          Manage users
        </a>
      </Card>
    </>
  )
}

function AdminDashboard({ data }: { data: AdminDashboardViewData }) {
  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatModalCard label="Students" value={data.peopleCounts.students} title="Students" load={loadStudentsModal} />
        <StatModalCard label="Tutors" value={data.peopleCounts.tutors} title="Tutors" load={loadTutorsModal} />
        <StatModalCard
          label="Active classes"
          value={data.activeClassCount}
          title="Active classes"
          load={loadActiveClassesModal}
        />
        <StatModalCard
          label="Revenue"
          value={data.revenueLabel}
          sub={`Payouts ${data.payoutLabel}`}
          tone="primary"
          title="Finance"
          load={loadFinanceModal}
          empty="None yet."
        />
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Students per class">
          <MiniBars data={data.perClass} />
        </Panel>
        <Panel title="Upcoming">
          <Upcoming events={data.upcoming} />
        </Panel>
        <ReminderPanel initialReminders={data.reminders} initialPastReminders={data.pastReminders} />
      </section>
    </>
  )
}

function TutorDashboard({ me }: { me: Profile }) {
  return (
    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Suspense fallback={<WidgetSkeleton />}>
        <TodaysClassesWidget me={me} title="Today's classes" />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton />}>
        <PendingAttendanceWidget me={me} />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton />}>
        <MeetingLinksWidget me={me} />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton />}>
        <RecentUploadsWidget me={me} />
      </Suspense>
    </section>
  )
}

function StudentDashboard({ me }: { me: Profile }) {
  return (
    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Suspense fallback={<WidgetSkeleton />}>
        <TodaysClassesWidget me={me} title="Today's class" />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton />}>
        <AttendanceRateWidget studentId={me.id} />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton />}>
        <LatestGradeWidget studentId={me.id} />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton />}>
        <LatestAnnouncementWidget me={me} />
      </Suspense>
    </section>
  )
}

function Upcoming({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-400">Nothing scheduled.</p>
  return (
    <ul className="space-y-2 text-sm">
      {events.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3">
          <span className="text-slate-700">{e.title}</span>
          <span className="shrink-0 text-xs text-slate-400">
            {e.event_date} - {e.kind}
          </span>
        </li>
      ))}
    </ul>
  )
}
