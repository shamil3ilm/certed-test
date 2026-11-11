import { Download } from 'lucide-react'
import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import { getAcademyBreakdown } from '@/lib/services/hours-breakdown'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { formatMonthLabel, todayInZone } from '@/lib/time/format'
import { isMonth } from '@/lib/time/month-window'
import { AlertBanner, EmptyState, PageHeader, FilterBar, MonthFilterField, SectionJumpNav } from '@/lib/ui'
import { ClassHoursTabs } from '../../ClassHoursTabs'
import { ReceivedHoursTable, WorkedHoursTable } from '../../HoursTables'

const SECTIONS = [
  { href: '#people', label: 'Tutors & mentors' },
  { href: '#students', label: 'Students' },
] as const

function SectionHeading({ id, title, note }: { id: string; title: string; note: string }) {
  return (
    <div className="mt-8 scroll-mt-24" id={id}>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-600">{note}</p>
    </div>
  )
}
/**
 * Academy-wide class-hours report, both sides of the same recorded sessions: hours TAUGHT
 * (per tutor/mentor, and the class x tutor detail behind it) and hours RECEIVED (per
 * student). Every figure is derived - nothing here is entered by hand.
 *
 * manageClasses-gated: admin + sub-admin oversight, never a mentor or tutor, who get their
 * own scoped views (/session-timings and the dashboard tile). Read-only.
 *
 * The student totals are NOT the sum of the tutor totals: one session taught for an hour
 * gives its tutor one hour and gives EACH attending student one hour, so the student side
 * scales with class size. Two different questions, deliberately reported apart.
 */
export default async function ClassHoursReportPage(props: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await props.searchParams
  // Parallelize capability check and institute timezone fetch to eliminate sequential waterfalls
  const [me, tz, actor] = await Promise.all([
    requireCapability('manageClasses'),
    getInstituteTimeZone(),
    getActorContext(),
  ])
  const canOpenSessions = actor.capabilities.allowed.has('viewMentees')
  const month = monthParam && isMonth(monthParam) ? monthParam : todayInZone(tz).slice(0, 7)
  const { people, students, untimedSessions } = await getAcademyBreakdown(me.id, month)
  const hasSessions = people.length > 0 || students.length > 0

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Class hours"
        description="Recorded hours for the selected month - worked, per tutor and mentor, and received, per student - split into regular, demo and exam. Calculated from session times; read-only."
      />

      {canOpenSessions && <ClassHoursTabs />}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <FilterBar applyLabel="View">
          <MonthFilterField defaultValue={month} name="month" />
        </FilterBar>
        <a
          href={`/api/teaching-hours/export?month=${encodeURIComponent(month)}`}
          download={`teaching-hours-${month}.csv`}
          className="btn btn-sm btn-soft inline-flex items-center gap-1.5"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Export CSV</span>
        </a>
      </div>

      {untimedSessions ? (
        <AlertBanner tone="warning" className="mt-4">
          {untimedSessions === 1 ? '1 session' : `${untimedSessions} sessions`} in {formatMonthLabel(month)} ha
          {untimedSessions === 1 ? 's' : 've'} no start and end time recorded, so{' '}
          {untimedSessions === 1 ? 'its' : 'their'} hours are not counted below. Open the class&apos;s attendance page
          for that date and add the times.
        </AlertBanner>
      ) : null}

      {!hasSessions ? (
        <EmptyState>No sessions recorded for {formatMonthLabel(month)}.</EmptyState>
      ) : (
        <>
          <div className="mt-4">
            <SectionJumpNav label="Class hours sections" items={SECTIONS} />
          </div>

          <SectionHeading
            id="people"
            title="Tutors & mentors"
            note="Working hours are regular teaching plus exam monitoring; an exam counts for whoever monitored it. Demo classes are shown beside it and are never working time. Expand any row or click Breakdown to view subject-by-subject and student-by-student details."
          />
          <WorkedHoursTable people={people} month={month} canLinkStudent={true} showTotal={true} />

          <SectionHeading
            id="students"
            title="Students"
            note="Hours of class received: a student is credited with a session's recorded window when marked present or late for it. Regular, demo and exam are kept apart. Expand any row or click Breakdown to view subject, tutor and exam-monitor details."
          />
          {students.length === 0 ? (
            <EmptyState>
              Sessions were recorded for {formatMonthLabel(month)}, but no student was marked present or late in any of
              them - so there are no student hours to report.
            </EmptyState>
          ) : (
            <ReceivedHoursTable
              title="Hours received, by student"
              headerLabel="Student"
              rows={students}
              month={month}
              canLinkTutor={true}
              canLinkStudent={true}
              showTotal={true}
            />
          )}
        </>
      )}
    </main>
  )
}
