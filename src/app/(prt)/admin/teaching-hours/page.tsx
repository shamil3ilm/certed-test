import Link from 'next/link'
import { Download } from 'lucide-react'
import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import { getAcademyBreakdown, type HoursBreakdown } from '@/lib/services/hours-breakdown'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { formatMonthLabel, todayInZone } from '@/lib/time/format'
import { isMonth } from '@/lib/time/month-window'
import { formatMinutes } from '@/lib/attendance/hours'
import { workingMinutes } from '@/lib/attendance/hours-breakdown'
import { AlertBanner, EmptyState, PageHeader, FilterBar, MonthFilterField, SectionJumpNav } from '@/lib/ui'
import { ClassHoursTabs } from '../../ClassHoursTabs'
import { PersonHoursView, StudentHoursView, ReceivedHoursTable, WorkedHoursTable } from '../../HoursTables'

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

/** A zero prints as a dash, so the figures that ARE there are not buried in a column of "0m". */
const cell = (minutes: number) => (minutes > 0 ? formatMinutes(minutes) : '-')

/**
 * Hours WORKED, one row per tutor / mentor, split by what the time was.
 * Subject-wise and student-wise breakdown is shown under each person for consistency with mentor views.
 */
function PeopleTable({ people, month }: { people: HoursBreakdown['people']; month: string }) {
  return <WorkedHoursTable people={people} month={month} canLinkStudent={true} showTotal={true} />
}

/** One collapsed card per person: open it for their subject-by-subject and student-by-student
 *  breakdown. Collapsed, because most readers want the totals and a few want the detail. */
function PeopleDetail({ people, month }: { people: HoursBreakdown['people']; month: string }) {
  return (
    <div className="mt-3 space-y-2">
      {people.map((p) => (
        <details key={p.personId ?? 'unassigned'} className="rounded-xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer select-none flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:text-primary">
            <span>{p.personName}</span>
            <span className="text-xs font-normal tabular-nums text-slate-500">
              Working {cell(workingMinutes(p.minutes))}
            </span>
          </summary>
          <div className="border-t border-slate-100 p-4">
            <PersonHoursView hours={p} month={month} canLinkStudent={true} />
          </div>
        </details>
      ))}
    </div>
  )
}

/**
 * Hours RECEIVED, one row per student, with regular, demo and exam as separate columns.
 * Subject-wise and tutor-wise breakdown is shown under each student for consistency with mentor views.
 */
function StudentsTable({ students, month }: { students: HoursBreakdown['students']; month: string }) {
  return (
    <ReceivedHoursTable
      title="Hours received, by student"
      headerLabel="Student"
      rows={students}
      month={month}
      canLinkTutor={true}
      canLinkStudent={true}
      showTotal={true}
    />
  )
}

/** One collapsed card per student: open it for subject, tutor and exam-monitor detail. */
function StudentsDetail({ students, month }: { students: HoursBreakdown['students']; month: string }) {
  return (
    <div className="mt-3 space-y-2">
      {students.map((s) => (
        <details key={s.studentId} className="rounded-xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer select-none flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:text-primary">
            <span>{s.studentName}</span>
            <span className="text-xs font-normal tabular-nums text-slate-500">
              Regular {cell(s.total.regular)}
              {s.total.demo > 0 && ` · Demo ${cell(s.total.demo)}`}
              {s.total.exam > 0 && ` · Exam ${cell(s.total.exam)}`}
            </span>
          </summary>
          <div className="border-t border-slate-100 p-4">
            <StudentHoursView hours={s} canLinkTutor={true} />
            <p className="mt-3 text-xs">
              <Link
                prefetch={false}
                href={`/students/${s.studentId}?hoursMonth=${month}#hours`}
                className="font-medium text-primary hover:underline"
              >
                See {s.studentName}&apos;s sessions one by one
              </Link>
            </p>
          </div>
        </details>
      ))}
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
  const me = await requireCapability('manageClasses')
  // The Sessions tab is its own route behind viewMentees; offer it only to a reader it admits.
  const [{ capabilities }, tz] = await Promise.all([getActorContext(), getInstituteTimeZone()])
  const canOpenSessions = capabilities.allowed.has('viewMentees')
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
            note="Working hours are regular teaching plus exam monitoring; an exam counts for whoever monitored it. Demo classes are shown beside it and are never working time. Open a name for the subject-by-subject and student-by-student detail."
          />
          <PeopleTable people={people} month={month} />
          <PeopleDetail people={people} month={month} />

          <SectionHeading
            id="students"
            title="Students"
            note="Hours of class received: a student is credited with a session's recorded window when marked present or late for it. Regular, demo and exam are kept apart. Open a name for the subject, tutor and exam-monitor detail."
          />
          {students.length === 0 ? (
            <EmptyState>
              Sessions were recorded for {formatMonthLabel(month)}, but no student was marked present or late in any of
              them - so there are no student hours to report.
            </EmptyState>
          ) : (
            <>
              <StudentsTable students={students} month={month} />
              <StudentsDetail students={students} month={month} />
            </>
          )}
        </>
      )}
    </main>
  )
}
