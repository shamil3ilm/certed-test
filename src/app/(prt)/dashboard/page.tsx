import Link from 'next/link'
import { Suspense } from 'react'
import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import type { Profile } from '@/lib/auth/profile'
import { myClassIds } from '@/lib/services/classes'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
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
  const data = await loadDashboardViewData(me, actor.capabilities.allowed)

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
        <SubAdminDashboard
          data={data}
          canViewUsers={actor.capabilities.allowed.has('viewUsers')}
          canManageUsers={actor.capabilities.allowed.has('manageUsers')}
          canManageMentorships={actor.capabilities.allowed.has('manageMentorships')}
        />
      )}
      {data.kind === 'mentor' && (
        <MentorDashboard
          me={me}
          mentees={data.mentees}
          teaches={data.teaches}
          now={data.now}
          canViewMentees={actor.capabilities.allowed.has('viewMentees')}
          canViewClasses={actor.capabilities.allowed.has('viewClasses')}
          canViewGrading={actor.capabilities.allowed.has('viewGrading')}
        />
      )}
      {data.kind === 'tutor' && (
        <TutorDashboard
          me={me}
          now={data.now}
          canViewClasses={actor.capabilities.allowed.has('viewClasses')}
          canViewGrading={actor.capabilities.allowed.has('viewGrading')}
        />
      )}
      {data.kind === 'student' && (
        <StudentDashboard me={me} now={data.now} canViewClasses={actor.capabilities.allowed.has('viewClasses')} />
      )}
      {data.kind === 'generic' && <GenericDashboard me={me} now={data.now} />}
    </main>
  )
}

/** The mentor view. Leads with the mentees (the pastoral work); the teaching
 *  widgets follow only when this mentor also teaches (a tutor who mentors). A
 *  dedicated mentor account teaches nothing, so it sees the mentees alone. */
function MentorDashboard({
  me,
  mentees,
  teaches,
  now,
  canViewMentees,
  canViewClasses,
  canViewGrading,
}: {
  me: Profile
  mentees: DashboardMentee[]
  teaches: boolean
  now: number
  canViewMentees: boolean
  canViewClasses: boolean
  canViewGrading: boolean
}) {
  return (
    <>
      {canViewMentees && <MenteesPanel mentees={mentees} />}
      {teaches ? (
        <TutorDashboard me={me} now={now} canViewClasses={canViewClasses} canViewGrading={canViewGrading} />
      ) : (
        // A dedicated mentor (no teaching widgets) still gets personal reminders.
        <section className="mt-6">
          <Suspense fallback={<WidgetSkeleton />}>
            <RemindersWidget me={me} now={now} />
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
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  )
}

function SubAdminDashboard({
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

function AdminDashboard({ data }: { data: AdminDashboardViewData }) {
  const statCards = [
    data.peopleCounts ? (
      <StatModalCard
        key="students"
        label="Students"
        value={data.peopleCounts.students}
        title="Students"
        load={loadStudentsModal}
      />
    ) : null,
    data.peopleCounts ? (
      <StatModalCard
        key="tutors"
        label="Tutors & mentors"
        value={data.peopleCounts.tutors}
        title="Tutors & mentors"
        load={loadTutorsModal}
      />
    ) : null,
    <StatModalCard
      key="classes"
      label="Active classes"
      value={data.activeClassCount}
      title="Active classes"
      load={loadActiveClassesModal}
    />,
    data.revenueLabel ? (
      <StatModalCard
        key="finance"
        label="Revenue"
        value={data.revenueLabel}
        sub={`Payouts ${data.payoutLabel ?? 'INR:0'}`}
        tone="primary"
        title="Finance"
        load={loadFinanceModal}
        empty="None yet."
      />
    ) : null,
  ].filter(Boolean)

  return (
    <>
      <StatGrid cols={4} className="mt-6">
        {statCards}
      </StatGrid>
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Students per class">
          <MiniBars data={data.perClass} />
          <Link href="/classroom" className="btn btn-sm btn-soft mt-3 min-h-10 px-3 py-2 text-sm font-semibold">
            Open classes &rarr;
          </Link>
        </Panel>
        <Panel title="Upcoming">
          <Upcoming events={data.upcoming} />
        </Panel>
        <ReminderPanel initialReminders={data.reminders} initialPastReminders={data.pastReminders} now={data.now} />
      </section>
    </>
  )
}

/** Tutor home leads with the work to do: today's classes, attendance to mark,
 *  submissions to review, then the latest class updates. */
function CapabilityNotice({ message }: { message: string }) {
  return (
    <Card className="mt-6 p-5">
      <h2 className="text-sm font-semibold text-slate-800">Dashboard access is limited</h2>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
    </Card>
  )
}

function TutorDashboard({
  me,
  now,
  canViewClasses,
  canViewGrading,
}: {
  me: Profile
  now: number
  canViewClasses: boolean
  canViewGrading: boolean
}) {
  if (!canViewClasses && !canViewGrading) {
    return (
      <section className="mt-6">
        <CapabilityNotice message="Class and grading widgets are hidden because this account does not currently have those features enabled." />
        <section className="mt-6">
          <Suspense fallback={<WidgetSkeleton />}>
            <RemindersWidget me={me} now={now} />
          </Suspense>
        </section>
      </section>
    )
  }

  const sharedDataPromise = Promise.all([myClassIds(me), getInstituteTimeZone()])

  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {canViewClasses && (
          <Suspense fallback={<WidgetSkeleton />}>
            <TutorTodaysClasses me={me} title="Today's classes" sharedDataPromise={sharedDataPromise} />
          </Suspense>
        )}
        {canViewClasses && (
          <Suspense fallback={<WidgetSkeleton />}>
            <TutorPendingAttendance me={me} sharedDataPromise={sharedDataPromise} />
          </Suspense>
        )}
        {canViewGrading && (
          <Suspense fallback={<WidgetSkeleton />}>
            <TutorSubmissionsToReview me={me} sharedDataPromise={sharedDataPromise} />
          </Suspense>
        )}
        {canViewClasses && (
          <Suspense fallback={<WidgetSkeleton />}>
            <TutorRecentUploads me={me} sharedDataPromise={sharedDataPromise} />
          </Suspense>
        )}
      </section>
      <section className="mt-6">
        <Suspense fallback={<WidgetSkeleton />}>
          <RemindersWidget me={me} now={now} />
        </Suspense>
      </section>
    </>
  )
}

/** Student home leads with what's owed: due work, then latest grade, attendance,
 *  and the latest class update. */
function StudentDashboard({ me, now, canViewClasses }: { me: Profile; now: number; canViewClasses: boolean }) {
  if (!canViewClasses) {
    return (
      <section className="mt-6">
        <CapabilityNotice message="Class widgets are hidden because this account does not currently have class access enabled." />
        <section className="mt-6">
          <Suspense fallback={<WidgetSkeleton />}>
            <RemindersWidget me={me} now={now} />
          </Suspense>
        </section>
      </section>
    )
  }

  const classIdsPromise = myClassIds(me)

  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<WidgetSkeleton />}>
          <StudentDueWork me={me} now={now} classIdsPromise={classIdsPromise} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <LatestGradeWidget studentId={me.id} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <AttendanceRateWidget studentId={me.id} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <StudentLatestAnnouncement me={me} classIdsPromise={classIdsPromise} />
        </Suspense>
      </section>
      <section className="mt-6">
        <Suspense fallback={<WidgetSkeleton />}>
          <RemindersWidget me={me} now={now} />
        </Suspense>
      </section>
    </>
  )
}

function GenericDashboard({ me, now }: { me: Profile; now: number }) {
  return (
    <>
      <section className="mt-6">
        <CapabilityNotice message="This account is active, but it does not yet have a persona-specific dashboard. Personal reminders remain available while feature access is being configured." />
      </section>
      <section className="mt-6">
        <Suspense fallback={<WidgetSkeleton />}>
          <RemindersWidget me={me} now={now} />
        </Suspense>
      </section>
    </>
  )
}

async function TutorTodaysClasses({
  me,
  title,
  sharedDataPromise,
}: {
  me: Profile
  title: string
  sharedDataPromise: Promise<[string[], string]>
}) {
  const [classIds, timeZone] = await sharedDataPromise
  return <TodaysClassesWidget me={me} title={title} data={{ classIds, timeZone }} />
}

async function TutorPendingAttendance({
  me,
  sharedDataPromise,
}: {
  me: Profile
  sharedDataPromise: Promise<[string[], string]>
}) {
  const [classIds, timeZone] = await sharedDataPromise
  return <PendingAttendanceWidget me={me} data={{ classIds, timeZone }} />
}

async function TutorRecentUploads({
  me,
  sharedDataPromise,
}: {
  me: Profile
  sharedDataPromise: Promise<[string[], string]>
}) {
  const [classIds] = await sharedDataPromise
  return <RecentUploadsWidget me={me} data={{ classIds }} />
}

async function TutorSubmissionsToReview({
  me,
  sharedDataPromise,
}: {
  me: Profile
  sharedDataPromise: Promise<[string[], string]>
}) {
  const [classIds] = await sharedDataPromise
  return <SubmissionsToReviewWidget me={me} data={{ classIds }} />
}

async function StudentDueWork({
  me,
  now,
  classIdsPromise,
}: {
  me: Profile
  now: number
  classIdsPromise: Promise<string[]>
}) {
  const classIds = await classIdsPromise
  return <DueWorkWidget me={me} now={now} data={{ classIds }} />
}

async function StudentLatestAnnouncement({ me, classIdsPromise }: { me: Profile; classIdsPromise: Promise<string[]> }) {
  const classIds = await classIdsPromise
  return <LatestAnnouncementWidget me={me} data={{ classIds }} />
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
