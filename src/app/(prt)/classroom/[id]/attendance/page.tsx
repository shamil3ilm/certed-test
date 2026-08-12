import { requireClassAccess } from '../../access'
import { type AttendanceStatus } from '@/lib/services/attendance'
import { attendanceRecordPageUrl, loadClassAttendancePageData } from '@/lib/services/page-data/class-attendance'
import { MarkAttendanceForm } from './MarkAttendanceForm'
import { SessionTimesForm } from './SessionTimesForm'
import { SessionFeedbackForm } from './SessionFeedbackForm'
import { clearAttendanceAction } from './actions'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import {
  AlertBanner,
  Card,
  EmptyState,
  Badge,
  SectionLabel,
  SectionJumpNav,
  DateFilterField,
  FilterBar,
  CARD,
  PaginationBar,
  SelectFilterField,
  cx,
} from '@/lib/ui'
import {
  formatMinutes,
  minutesBetween,
  sessionMetrics,
  studentMetrics,
  type SessionTimes,
} from '@/lib/attendance/hours'

function statusTone(s: AttendanceStatus): 'success' | 'warning' | 'danger' {
  return s === 'present' ? 'success' : s === 'late' ? 'warning' : 'danger'
}

const EMPTY_SESSION_TIMES: SessionTimes = {
  scheduled_start: null,
  scheduled_end: null,
  actual_start: null,
  actual_end: null,
  tutor_join_at: null,
  tutor_leave_at: null,
}

function HourStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}

export default async function AttendancePage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ date?: string; recPage?: string; error?: string }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { me, course } = await requireClassAccess(params.id)
  const data = await loadClassAttendancePageData(me, course.id, searchParams)

  if (data.kind === 'student') {
    const sessionByDate = new Map(data.sessions.map((s) => [s.session_date, s]))
    return (
      <div className="space-y-4">
        <SectionLabel>My attendance</SectionLabel>
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <div>
            <p className="text-2xl font-bold text-slate-900">{data.summary.rate}%</p>
            <p className="text-xs text-slate-400">
              attendance{data.summary.total > 0 ? ` - ${data.summary.total} session(s)` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="success">Present {data.summary.present}</Badge>
            <Badge tone="warning">Late {data.summary.late}</Badge>
            <Badge tone="danger">Absent {data.summary.absent}</Badge>
          </div>
        </Card>
        {data.recTotal === 0 ? (
          <EmptyState>No attendance recorded yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {data.rows.map((row) => {
              const s = sessionByDate.get(row.session_date)
              const learning = s
                ? studentMetrics(s, { join_at: row.join_at, leave_at: row.leave_at }).learningMinutes
                : null
              return (
                <li key={row.id} className="rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-medium text-slate-700">{row.session_date}</span>
                    <span className="flex items-center gap-2">
                      {learning != null && <span className="text-xs text-slate-400">{formatMinutes(learning)}</span>}
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </span>
                  </div>
                  <details className="border-t border-slate-100 px-4 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-primary transition hover:underline">
                      Summary &amp; feedback
                    </summary>
                    {s?.summary ? (
                      <div className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Tutor&apos;s summary
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{s.summary}</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">No summary from your tutor for this session yet.</p>
                    )}
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Your feedback</p>
                    <SessionFeedbackForm
                      classId={course.id}
                      date={row.session_date}
                      initial={s?.student_feedback ?? null}
                    />
                  </details>
                </li>
              )
            })}
          </ul>
        )}
        <PaginationBar
          page={data.recPage}
          totalPages={data.recTotalPages}
          total={data.recTotal}
          previousHref={data.recPage > 1 ? attendanceRecordPageUrl(data.recPage - 1) : undefined}
          nextHref={data.recPage < data.recTotalPages ? attendanceRecordPageUrl(data.recPage + 1) : undefined}
        />
      </div>
    )
  }

  const sessionM = sessionMetrics(data.session ?? EMPTY_SESSION_TIMES)

  return (
    <div className="space-y-8">
      <SectionJumpNav
        label="Attendance sections"
        items={[
          { href: '#mark-attendance', label: 'Mark attendance' },
          { href: '#attendance-history', label: 'Attendance details' },
        ]}
      />

      <section id="mark-attendance" className="scroll-mt-20 space-y-4">
        <SectionLabel>Mark attendance</SectionLabel>

        {searchParams?.error === '1' && (
          <AlertBanner>That change couldn&apos;t be applied. Please check the date and try again.</AlertBanner>
        )}

        <form className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-500">
            Session date
            <input
              type="date"
              name="date"
              defaultValue={data.date}
              className="mt-1 block rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <button type="submit" className="btn btn-sm btn-soft">
            Load
          </button>
        </form>

        <SessionTimesForm classId={course.id} date={data.date} session={data.session} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HourStat label="Session" value={formatMinutes(sessionM.sessionMinutes)} />
          <HourStat label="Scheduled" value={formatMinutes(sessionM.scheduledMinutes)} />
          <HourStat label="Tutor working" value={formatMinutes(sessionM.tutorWorkingMinutes)} />
        </div>

        {data.roster.length === 0 ? (
          <EmptyState>No students enrolled yet - add students on the People tab first.</EmptyState>
        ) : (
          <>
            <MarkAttendanceForm classId={course.id} date={data.date} students={data.roster} session={data.session} />
            {data.hasMarks && (
              <form action={clearAttendanceAction} className="flex justify-end">
                <input type="hidden" name="class_id" value={course.id} />
                <input type="hidden" name="session_date" value={data.date} />
                <ConfirmSubmit
                  className="btn btn-sm btn-ghost text-red-600"
                  title="Clear this session?"
                  message={`This removes every mark for ${data.date}. You can re-mark it afterwards.`}
                  confirmLabel="Clear session"
                >
                  Clear this session
                </ConfirmSubmit>
              </form>
            )}
          </>
        )}
      </section>

      <section id="attendance-history" className="scroll-mt-20 space-y-3">
        <SectionLabel>Attendance details</SectionLabel>
        {/* GET form: status + date-range filters run server-side. Keeps the marking
            `date` so applying a filter doesn't reset the session above. */}
        <FilterBar clearHref={`?date=${data.date}`} showClear={data.hasHistoryFilters}>
          <input type="hidden" name="date" value={data.date} />
          <SelectFilterField label="Status" name="aStatus" defaultValue={data.historyFilters.status}>
            <option value="">All statuses</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
          </SelectFilterField>
          <DateFilterField label="From" name="aFrom" defaultValue={data.historyFilters.from} />
          <DateFilterField label="To" name="aTo" defaultValue={data.historyFilters.to} />
        </FilterBar>

        {data.history.length === 0 ? (
          <EmptyState className="mt-3">
            {data.hasHistoryFilters ? 'No records match these filters.' : 'No attendance recorded yet.'}
          </EmptyState>
        ) : (
          <div className={cx(CARD, 'mt-3 overflow-x-auto')}>
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className="text-left">
                    Date
                  </th>
                  <th scope="col" className="text-left">
                    Student
                  </th>
                  <th scope="col" className="text-left">
                    Status
                  </th>
                  <th scope="col" className="text-left">
                    Time in class
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((row, i) => {
                  const learned = minutesBetween(row.join_at, row.leave_at)
                  return (
                    <tr key={`${row.session_date}-${row.name}-${i}`}>
                      <td className="whitespace-nowrap">
                        <a
                          href={`?date=${row.session_date}`}
                          className="font-medium text-slate-700 transition hover:text-primary"
                          title="Open this session"
                        >
                          {row.session_date}
                        </a>
                      </td>
                      <td className="whitespace-nowrap text-slate-600">{row.name}</td>
                      <td className="whitespace-nowrap">
                        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-slate-500">
                        {learned != null ? formatMinutes(learned) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
