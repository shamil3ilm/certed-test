import { Suspense } from 'react'
import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import type { Profile } from '@/lib/auth/profile'
import {
  type AdminDashboardViewData,
  type DashboardMentee,
  loadDashboardViewData,
  type SubAdminDashboardViewData,
} from '@/lib/services/page-data/dashboard'
import { type CalendarEvent } from '@/lib/services/calendar-events'
import { Panel, MiniBars, Card, Avatar, ListRow, StatGrid, personaLabel } from '@/lib/ui'
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
  RecentUploadsWidget,
  SubmissionsToReviewWidget,
  DueWorkWidget,
  RemindersWidget,
} from './widgets'

export default async function Dashboard() {
  // Entry page: guarded by the capability, not a fixed role list, so the guard
  // stays in step with the capability-driven nav and with any persona (now or
  // future) that legitimately holds viewDashboard.
  const me = await requireCapability('viewDashboard')
  const actor = await getActorContext() // request-cached; already loaded by the header
  const data = await loadDashboardViewData(me)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-5 text-white shadow-sm sm:p-6 lg:p-8">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
          Welcome, {me.full_name ?? me.email}
        </h1>
        <p className="mt-1 text-sm text-white/80">{personaLabel(actor.personas)} - Cert-Ed Academia portal</p>
      </div>

      {data.kind === 'admin' && <AdminDashboard data={data} />}
      {data.kind === 'sub_admin' && (
        <SubAdminDashboard data={data} canManageMentorships={actor.capabilities.allowed.has('manageMentorships')} />
      )}
      {data.kind === 'mentor' && <MentorDashboard me={me} mentees={data.mentees} teaches={data.teaches} />}
      {data.kind === 'tutor' && <TutorDashboard me={me} />}
      {data.kind === 'student' && <StudentDashboard me={me} />}
    </main>
  )
}

/** The mentor view. Leads with the mentees (the pastoral work); the teaching
 *  widgets follow only when this mentor also teaches (a tutor who mentors). A
 *  dedicated mentor account teaches nothing, so it sees the mentees alone. */
function MentorDashboard({ me, mentees, teaches }: { me: Profile; mentees: DashboardMentee[]; teaches: boolean }) {
  return (
    <>
      <MenteesPanel mentees={mentees} />
      {teaches ? (
        <TutorDashboard me={me} />
      ) : (
        // A dedicated mentor (no teaching widgets) still gets personal reminders.
        <section className="mt-6">
          <Suspense fallback={<WidgetSkeleton />}>
            <RemindersWidget me={me} />
          </Suspense>
        </section>
      )}
    </>
  )
}

/** The "Your mentees" panel - the actor's mentees, each linking to their overview. */
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
              <ListRow
                href={`/students/${mentee.id}`}
                leading={<Avatar name={mentee.name} role="student" />}
                title={mentee.name}
              />
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  )
}

function SubAdminDashboard({
  data,
  canManageMentorships,
}: {
  data: SubAdminDashboardViewData
  canManageMentorships: boolean
}) {
  return (
    <>
      <StatGrid cols={3} className="mt-6">
        <StatModalCard
          label="Students"
          value={data.students}
          title="Students"
          load={loadStudentsModal}
          empty="No students yet."
        />
        <StatModalCard
          label="Tutors & mentors"
          value={data.tutors}
          title="Tutors & mentors"
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
      </StatGrid>
      <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">User management</h2>
          <p className="mt-1 text-sm text-slate-500">
            {canManageMentorships
              ? 'Add, edit or revoke students and tutors, and assign mentors.'
              : 'Add, edit or revoke students and tutors.'}
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
      <StatGrid cols={4} className="mt-6">
        <StatModalCard label="Students" value={data.peopleCounts.students} title="Students" load={loadStudentsModal} />
        <StatModalCard
          label="Tutors & mentors"
          value={data.peopleCounts.tutors}
          title="Tutors & mentors"
          load={loadTutorsModal}
        />
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
      </StatGrid>
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

/** Tutor home leads with the work to do: today's classes, attendance to mark,
 *  submissions to review, then the latest class updates. */
function TutorDashboard({ me }: { me: Profile }) {
  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<WidgetSkeleton />}>
          <TodaysClassesWidget me={me} title="Today's classes" />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <PendingAttendanceWidget me={me} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <SubmissionsToReviewWidget me={me} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <RecentUploadsWidget me={me} />
        </Suspense>
      </section>
      <section className="mt-6">
        <Suspense fallback={<WidgetSkeleton />}>
          <RemindersWidget me={me} />
        </Suspense>
      </section>
    </>
  )
}

/** Student home leads with what's owed: due work, then latest grade, attendance,
 *  and the latest class update. */
function StudentDashboard({ me }: { me: Profile }) {
  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<WidgetSkeleton />}>
          <DueWorkWidget me={me} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <LatestGradeWidget studentId={me.id} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <AttendanceRateWidget studentId={me.id} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <LatestAnnouncementWidget me={me} />
        </Suspense>
      </section>
      <section className="mt-6">
        <Suspense fallback={<WidgetSkeleton />}>
          <RemindersWidget me={me} />
        </Suspense>
      </section>
    </>
  )
}

function Upcoming({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-400">Nothing scheduled.</p>
  return (
    <ul className="space-y-1 text-sm">
      {events.map((e) => (
        <li key={e.id}>
          <a
            href="/calendar"
            className="flex items-center justify-between gap-3 rounded-md py-1 text-slate-700 transition hover:text-primary"
          >
            <span className="min-w-0 truncate">{e.title}</span>
            <span className="shrink-0 text-xs text-slate-400">
              {e.event_date} - {e.kind}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
