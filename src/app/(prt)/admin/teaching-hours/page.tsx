import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import { getAcademyClassHours, type AcademyClassHours } from '@/lib/services/teaching-hours'
import { getAcademyBreakdown, type HoursBreakdown } from '@/lib/services/hours-breakdown'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { formatMonthLabel, todayInZone } from '@/lib/time/format'
import { isMonth } from '@/lib/time/month-window'
import { formatMinutes } from '@/lib/attendance/hours'
import { workingMinutes } from '@/lib/attendance/hours-breakdown'
import {
  AlertBanner,
  CARD,
  EmptyState,
  PageHeader,
  FilterBar,
  FilterField,
  FILTER_CONTROL,
  SectionJumpNav,
  roleLabelIfUnexpected,
  cx,
} from '@/lib/ui'
import { ClassHoursTabs } from '../../ClassHoursTabs'
import { PersonHoursView, StudentHoursView } from '../../HoursTables'

const SECTIONS = [
  { href: '#people', label: 'Tutors & mentors' },
  { href: '#by-class', label: 'By class' },
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

/** Right-aligned numeric cell - tabular figures keep the hour columns on a common axis. */
function Num({ children }: { children: React.ReactNode }) {
  return <td className="p-2 text-right tabular-nums text-slate-600">{children}</td>
}

/**
 * Header for a `Num` column. From `sm` up it is fixed and narrow, so the counts cluster at
 * the right of the table instead of being spread across it by auto layout: these are one- or
 * two-character figures, and a column sized for the whole table strands each one far from the
 * next. Below `sm` the width is left to auto layout - three fixed columns plus a name would
 * exceed a phone's width and put the hours behind a sideways scroll.
 */
function NumHead({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="p-2 text-right sm:w-28">
      {children}
    </th>
  )
}

/** A zero prints as a dash, so the figures that ARE there are not buried in a column of "0m". */
const cell = (minutes: number) => (minutes > 0 ? formatMinutes(minutes) : '-')

/**
 * Hours WORKED, one row per tutor / mentor, split by what the time was. Working = Regular +
 * Exam monitoring; Demo is reported beside it and never part of it. An exam is credited to the
 * person who MONITORED it, which is not always the class's tutor.
 */
function PeopleTable({ people, month }: { people: HoursBreakdown['people']; month: string }) {
  const sum = (pick: (p: HoursBreakdown['people'][number]) => number) => people.reduce((n, p) => n + pick(p), 0)
  const sessions = sum((p) => p.sessions.regular + p.sessions.demo + p.sessions.exam)
  return (
    <div className={cx(CARD, 'mt-3 overflow-x-auto')}>
      <table aria-label="Hours worked, by tutor and mentor" className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <th scope="col" className="p-2">
              Tutor / mentor
            </th>
            <NumHead>Sessions</NumHead>
            <NumHead>Regular</NumHead>
            <NumHead>Exam</NumHead>
            <NumHead>Demo</NumHead>
            <NumHead>Working</NumHead>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.personId ?? 'unassigned'} className="border-t">
              <td className="p-2 font-medium text-slate-800">
                <span className="inline-flex items-baseline gap-1.5">
                  {p.personId ? (
                    <Link
                      href={`/admin/teaching-hours/person/${p.personId}?month=${month}`}
                      className="hover:text-primary hover:underline"
                    >
                      {p.personName}
                    </Link>
                  ) : (
                    p.personName
                  )}
                  {roleLabelIfUnexpected(p.personRole, 'tutor') && (
                    <span className="text-meta font-medium text-slate-500">
                      {roleLabelIfUnexpected(p.personRole, 'tutor')}
                    </span>
                  )}
                </span>
              </td>
              <Num>{p.sessions.regular + p.sessions.demo + p.sessions.exam}</Num>
              <Num>{cell(p.minutes.regular)}</Num>
              <Num>{cell(p.minutes.exam)}</Num>
              <Num>{cell(p.minutes.demo)}</Num>
              <td className="p-2 text-right font-medium tabular-nums text-slate-800">
                {cell(workingMinutes(p.minutes))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-medium text-slate-700">
            <td className="p-2">Total - {formatMonthLabel(month)}</td>
            <td className="p-2 text-right tabular-nums">{sessions}</td>
            <td className="p-2 text-right tabular-nums">{cell(sum((p) => p.minutes.regular))}</td>
            <td className="p-2 text-right tabular-nums">{cell(sum((p) => p.minutes.exam))}</td>
            <td className="p-2 text-right tabular-nums">{cell(sum((p) => p.minutes.demo))}</td>
            <td className="p-2 text-right tabular-nums">{cell(sum((p) => workingMinutes(p.minutes)))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** One collapsed card per person: open it for their subject-by-subject and student-by-student
 *  breakdown. Collapsed, because most readers want the totals and a few want the detail. */
function PeopleDetail({ people }: { people: HoursBreakdown['people'] }) {
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
            <PersonHoursView hours={p} />
          </div>
        </details>
      ))}
    </div>
  )
}

function ClassTutorTable({ classes, month }: { classes: AcademyClassHours['tutorClasses']; month: string }) {
  const minutes = classes.reduce((sum, c) => sum + c.totalMinutes, 0)
  const sessions = classes.reduce((sum, c) => sum + c.tutors.reduce((s, t) => s + t.sessionCount, 0), 0)
  return (
    <div className={cx(CARD, 'mt-3 overflow-x-auto')}>
      <table aria-label="Hours by class and tutor" className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <th scope="col" className="p-2">
              Class
            </th>
            <th scope="col" className="p-2">
              Tutor
            </th>
            <NumHead>Sessions</NumHead>
            <NumHead>Hours</NumHead>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) =>
            c.tutors.map((t, i) => (
              <tr key={`${c.classId}:${c.subjectName ?? ''}:${t.tutorId ?? 'unassigned'}`} className="border-t">
                {/* The class name prints once per group; the repeat would be noise. A class
                    that taught two subjects this month is TWO groups, so the subject is
                    named underneath - otherwise the rows read as an unexplained duplicate. */}
                <td className="p-2 font-medium text-slate-800">
                  {i === 0 ? (
                    <>
                      {c.className}
                      {c.subjectName && (
                        <span className="block text-xs font-normal text-slate-500">{c.subjectName}</span>
                      )}
                    </>
                  ) : (
                    ''
                  )}
                </td>
                {/* Role shown only when it is NOT a plain tutor: these hours feed the
                    payslip draft, so a mentor account credited with teaching is worth
                    seeing, while "Tutor" on every row would just be skimmed past. */}
                <td className="p-2 text-slate-600">
                  <span className="inline-flex items-baseline gap-1.5">
                    {t.tutorName}
                    {roleLabelIfUnexpected(t.tutorRole, 'tutor') && (
                      <span className="text-meta font-medium text-slate-500">
                        {roleLabelIfUnexpected(t.tutorRole, 'tutor')}
                      </span>
                    )}
                  </span>
                </td>
                <Num>{t.sessionCount}</Num>
                <Num>{formatMinutes(t.minutes)}</Num>
              </tr>
            )),
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-medium text-slate-700">
            <td className="p-2" colSpan={2}>
              Total - {formatMonthLabel(month)}
            </td>
            <td className="p-2 text-right tabular-nums">{sessions}</td>
            <td className="p-2 text-right tabular-nums">{formatMinutes(minutes)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/**
 * Hours RECEIVED, one row per student, with regular, demo and exam as separate columns. A
 * student is credited with a session's recorded window when marked present or late for it.
 * Each row opens (below) into subject-by-subject and tutor-by-tutor detail.
 */
function StudentsTable({ students, month }: { students: HoursBreakdown['students']; month: string }) {
  const sum = (pick: (s: HoursBreakdown['students'][number]) => number) => students.reduce((n, s) => n + pick(s), 0)
  return (
    <div className={cx(CARD, 'mt-3 overflow-x-auto')}>
      <table aria-label="Hours received, by student" className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <th scope="col" className="p-2">
              Student
            </th>
            <NumHead>Regular</NumHead>
            <NumHead>Demo</NumHead>
            <NumHead>Exam</NumHead>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.studentId} className="border-t">
              <td className="p-2 font-medium text-slate-800">{s.studentName}</td>
              <td className="p-2 text-right font-medium tabular-nums text-slate-800">{cell(s.total.regular)}</td>
              <Num>{cell(s.total.demo)}</Num>
              <Num>{cell(s.total.exam)}</Num>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {/* The hours DO add up: they are hours received, and the academy delivered the sum of
              them. No session count, because a session taught to two students would be counted
              twice - the real session count for the month is in the tutor table above. */}
          <tr className="border-t-2 font-medium text-slate-700">
            <td className="p-2">Total - {formatMonthLabel(month)}</td>
            <td className="p-2 text-right tabular-nums">{cell(sum((s) => s.total.regular))}</td>
            <td className="p-2 text-right tabular-nums">{cell(sum((s) => s.total.demo))}</td>
            <td className="p-2 text-right tabular-nums">{cell(sum((s) => s.total.exam))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
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
            <StudentHoursView hours={s} />
            <p className="mt-3 text-xs">
              <Link
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
  const { capabilities } = await getActorContext()
  const canOpenSessions = capabilities.allowed.has('viewMentees')
  const tz = await getInstituteTimeZone()
  const month = monthParam && isMonth(monthParam) ? monthParam : todayInZone(tz).slice(0, 7)
  const [{ tutorClasses }, { people, students, untimedSessions }] = await Promise.all([
    getAcademyClassHours(me.id, month),
    getAcademyBreakdown(me.id, month),
  ])
  const hasSessions = tutorClasses.length > 0

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Class hours"
        description="Recorded hours for the selected month - worked, per tutor and mentor, and received, per student - split into regular, demo and exam. Calculated from session times; read-only."
      />

      {canOpenSessions && <ClassHoursTabs />}

      <FilterBar className="mt-4" applyLabel="View">
        <FilterField label="Month">
          <input type="month" name="month" defaultValue={month} className={cx(FILTER_CONTROL, 'block')} />
        </FilterField>
      </FilterBar>

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
          <PeopleDetail people={people} />

          <SectionHeading
            id="by-class"
            title="By class and tutor"
            note="Every recorded session, demo and exam included - the figures receipts and pay slips are still drafted from, until what a demo or an exam should bill is decided."
          />
          <ClassTutorTable classes={tutorClasses} month={month} />

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
