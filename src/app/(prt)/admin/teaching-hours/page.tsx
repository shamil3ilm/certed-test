import { requireCapability } from '@/lib/auth/require-role'
import { getAcademyClassHours, type AcademyClassHours } from '@/lib/services/teaching-hours'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { formatMonthLabel, todayInZone } from '@/lib/time/format'
import { isMonth } from '@/lib/time/month-window'
import { formatMinutes } from '@/lib/attendance/hours'
import { CARD, EmptyState, PageHeader, FilterBar, FilterField, FILTER_CONTROL, SectionJumpNav, cx } from '@/lib/ui'

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

function PersonTotals({ totals, month }: { totals: AcademyClassHours['personTotals']; month: string }) {
  const minutes = totals.reduce((sum, t) => sum + t.minutes, 0)
  const sessions = totals.reduce((sum, t) => sum + t.sessionCount, 0)
  return (
    <div className={cx(CARD, 'mt-3 overflow-x-auto')}>
      <table className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <th scope="col" className="p-2">
              Tutor / mentor
            </th>
            <th scope="col" className="p-2 text-right">
              Classes
            </th>
            <th scope="col" className="p-2 text-right">
              Sessions
            </th>
            <th scope="col" className="p-2 text-right">
              Hours
            </th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.personId ?? 'unassigned'} className="border-t">
              <td className="p-2 font-medium text-slate-800">{t.personName}</td>
              <Num>{t.classCount}</Num>
              <Num>{t.sessionCount}</Num>
              <Num>{formatMinutes(t.minutes)}</Num>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-medium text-slate-700">
            <td className="p-2">Total - {formatMonthLabel(month)}</td>
            <td className="p-2" />
            <td className="p-2 text-right tabular-nums">{sessions}</td>
            <td className="p-2 text-right tabular-nums">{formatMinutes(minutes)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function ClassTutorTable({ classes, month }: { classes: AcademyClassHours['tutorClasses']; month: string }) {
  const minutes = classes.reduce((sum, c) => sum + c.totalMinutes, 0)
  const sessions = classes.reduce((sum, c) => sum + c.tutors.reduce((s, t) => s + t.sessionCount, 0), 0)
  return (
    <div className={cx(CARD, 'mt-3 overflow-x-auto')}>
      <table className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <th scope="col" className="p-2">
              Class
            </th>
            <th scope="col" className="p-2">
              Tutor
            </th>
            <th scope="col" className="p-2 text-right">
              Sessions
            </th>
            <th scope="col" className="p-2 text-right">
              Hours
            </th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) =>
            c.tutors.map((t, i) => (
              <tr key={`${c.classId}:${t.tutorId ?? 'unassigned'}`} className="border-t">
                {/* The class name prints once per group; the repeat would be noise. */}
                <td className="p-2 font-medium text-slate-800">{i === 0 ? c.className : ''}</td>
                <td className="p-2 text-slate-600">{t.tutorName}</td>
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

function ClassStudentTable({ classes, month }: { classes: AcademyClassHours['studentClasses']; month: string }) {
  const minutes = classes.reduce((sum, c) => sum + c.totalMinutes, 0)
  const sessions = classes.reduce((sum, c) => sum + c.students.reduce((s, t) => s + t.sessionCount, 0), 0)
  return (
    <div className={cx(CARD, 'mt-3 overflow-x-auto')}>
      <table className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <th scope="col" className="p-2">
              Class
            </th>
            <th scope="col" className="p-2">
              Student
            </th>
            <th scope="col" className="p-2 text-right">
              Sessions
            </th>
            <th scope="col" className="p-2 text-right">
              Hours
            </th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) =>
            c.students.map((s, i) => (
              <tr key={`${c.classId}:${s.studentId}`} className="border-t">
                <td className="p-2 font-medium text-slate-800">{i === 0 ? c.className : ''}</td>
                <td className="p-2 text-slate-600">{s.studentName}</td>
                <Num>{s.sessionCount}</Num>
                <Num>{formatMinutes(s.minutes)}</Num>
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
  const tz = await getInstituteTimeZone()
  const month = monthParam && isMonth(monthParam) ? monthParam : todayInZone(tz).slice(0, 7)
  const { personTotals, tutorClasses, studentClasses } = await getAcademyClassHours(me.id, month)
  const hasSessions = tutorClasses.length > 0

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Class hours"
        description="Recorded hours for the selected month - taught, per tutor and mentor, and received, per student. Calculated from session times; read-only."
      />

      <FilterBar className="mt-2" applyLabel="View">
        <FilterField label="Month">
          <input type="month" name="month" defaultValue={month} className={cx(FILTER_CONTROL, 'block')} />
        </FilterField>
      </FilterBar>

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
            note="Hours taught, summed across every class the person ran this month."
          />
          <PersonTotals totals={personTotals} month={month} />

          <SectionHeading
            id="by-class"
            title="By class and tutor"
            note="The breakdown behind the totals above - one row per class and tutor."
          />
          <ClassTutorTable classes={tutorClasses} month={month} />

          <SectionHeading
            id="students"
            title="Students"
            note="Hours of class received: a student is credited with a session's recorded window when marked present or late for it."
          />
          {studentClasses.length === 0 ? (
            <EmptyState>
              Sessions were recorded for {formatMonthLabel(month)}, but no student was marked present or late in any of
              them - so there are no student hours to report.
            </EmptyState>
          ) : (
            <ClassStudentTable classes={studentClasses} month={month} />
          )}
        </>
      )}
    </main>
  )
}
