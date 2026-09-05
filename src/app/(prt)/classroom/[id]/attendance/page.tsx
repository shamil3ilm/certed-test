import { requireClassAccess } from '../../access'
import { getActorContext } from '@/lib/session/actor-context'
import { type AttendanceStatus } from '@/lib/services/attendance'
import { attendanceRecordPageUrl, loadClassAttendancePageData } from '@/lib/services/page-data/class-attendance'
import { MarkAttendanceForm } from './MarkAttendanceForm'
import { SessionTimesForm } from './SessionTimesForm'
import { SessionFeedbackForm } from './SessionFeedbackForm'
import { clearAttendanceAction, deleteSessionAction } from './actions'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import {
  AlertBanner,
  EmptyState,
  Badge,
  SectionLabel,
  SectionJumpNav,
  DateFilterField,
  FilterBar,
  CARD,
  StatCard,
  PaginationBar,
  SelectFilterField,
  cx,
  statusLabel,
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

export default async function AttendancePage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ date?: string; recPage?: string; error?: string }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { me, course } = await requireClassAccess(params.id)
  const data = await loadClassAttendancePageData(me, course.id, searchParams)

  if (data.kind === 'student') {
    // A class may hold SEVERAL sessions on one date, so group them - a Map keyed by date
    // would keep only the last one, hiding every earlier session's summary and shortening
    // the learning time to that one window.
    const sessionsByDate = new Map<string, typeof data.sessions>()
    for (const session of data.sessions) {
      const forDate = sessionsByDate.get(session.session_date) ?? []
      forDate.push(session)
      sessionsByDate.set(session.session_date, forDate)
    }
    return (
      <div className="space-y-4">
        <SectionLabel>My attendance</SectionLabel>
        <div className="flex flex-wrap items-center gap-4">
          <StatCard
            label="Attendance"
            value={`${data.summary.rate}%`}
            sub={data.summary.total > 0 ? `${data.summary.total} session(s)` : undefined}
            tone="primary"
          />
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="success">Present {data.summary.present}</Badge>
            <Badge tone="warning">Late {data.summary.late}</Badge>
            <Badge tone="danger">Absent {data.summary.absent}</Badge>
          </div>
        </div>
        {data.recTotal === 0 ? (
          <EmptyState>No attendance recorded yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {data.rows.map((row) => {
              const daySessions = sessionsByDate.get(row.session_date) ?? []
              // One mark per SESSION since 0094, so learning time is measured against
              // the day's OVERALL window (earliest start -> latest end) across its sessions.
              const dayStarts = daySessions.map((x) => x.actual_start).filter((v): v is string => v != null)
              const dayEnds = daySessions.map((x) => x.actual_end).filter((v): v is string => v != null)
              const s = daySessions[0] ?? null
              const learning = daySessions.length
                ? studentMetrics(
                    {
                      ...daySessions[0],
                      actual_start: dayStarts.length ? dayStarts.reduce((a, b) => (a < b ? a : b)) : null,
                      actual_end: dayEnds.length ? dayEnds.reduce((a, b) => (a > b ? a : b)) : null,
                    },
                    { join_at: row.join_at, leave_at: row.leave_at },
                  ).learningMinutes
                : null
              return (
                <li key={row.id} className="rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-medium text-slate-700">{row.session_date}</span>
                    <span className="flex items-center gap-2">
                      {learning != null && <span className="text-xs text-slate-600">{formatMinutes(learning)}</span>}
                      <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                    </span>
                  </div>
                  <details className="border-t border-slate-100 px-4 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-primary transition hover:underline">
                      Summary &amp; feedback
                    </summary>
                    {daySessions.some((x) => x.summary) ? (
                      <div className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Tutor&apos;s summary
                        </p>
                        {daySessions
                          .filter((x) => x.summary)
                          .map((x, i, all) => (
                            <p key={x.id} className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                              {all.length > 1 && (
                                <span className="mr-1 font-semibold text-slate-600">Session {i + 1}:</span>
                              )}
                              {x.summary}
                            </p>
                          ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-600">No summary from your tutor for this session yet.</p>
                    )}
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Your feedback</p>
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

  // A class may hold SEVERAL sessions on one date. The day's length is the sum of them,
  // and the per-student learning metrics are bounded by the day's overall window
  // (earliest start -> latest end), since attendance is recorded per day, not per session.
  const daySessions = data.sessions
  const dayMinutes = daySessions.reduce((total, s) => total + (sessionMetrics(s).sessionMinutes ?? 0), 0)
  const starts = daySessions.map((s) => s.actual_start).filter((v): v is string => v != null)
  const ends = daySessions.map((s) => s.actual_end).filter((v): v is string => v != null)
  const dayWindow = {
    ...EMPTY_SESSION_TIMES,
    actual_start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
    actual_end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
  }
  // Everyone reaching this manager view holds manageAttendance, so all may mark and edit
  // the session TIMES + SUMMARY (mentors included). The staff-PRIVATE note and the
  // destructive "clear session" need manageClassContent (tutor / admin). Strip the note
  // VALUE from a non-content actor's payload so it never reaches their browser, and hide
  // the field + the clear control below.
  const canManageContent = (await getActorContext()).capabilities.allowed.has('manageClassContent')
  const rosterBySession = new Map(data.sessionRosters.map((r) => [r.session.id, r.roster]))
  const sessionsForForm = canManageContent
    ? daySessions
    : daySessions.map((session) => ({ ...session, staff_note: null }))

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
          <label className="text-xs font-medium text-slate-600">
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

        {sessionsForForm.map((session, index) => (
          <div key={session.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>
                Session {index + 1} of {sessionsForForm.length}
              </SectionLabel>
              <form action={deleteSessionAction}>
                <input type="hidden" name="class_id" value={course.id} />
                <input type="hidden" name="session_id" value={session.id} />
                <input type="hidden" name="session_date" value={data.date} />
                <ConfirmSubmit
                  className="btn btn-sm btn-ghost text-red-600"
                  title="Remove this session?"
                  message="Every attendance mark for this session is deleted with it, and its hours drop out of the monthly total. Other sessions on this date are unaffected."
                  confirmLabel="Remove session"
                  pendingLabel="Removing..."
                >
                  Remove session
                </ConfirmSubmit>
              </form>
            </div>
            <SessionTimesForm
              classId={course.id}
              date={data.date}
              session={session}
              canEditStaffNote={canManageContent}
            />
            {data.roster.length > 0 && (
              <MarkAttendanceForm
                classId={course.id}
                date={data.date}
                sessionId={session.id}
                students={rosterBySession.get(session.id) ?? []}
                session={session}
              />
            )}
            {canManageContent && (rosterBySession.get(session.id)?.length ?? 0) > 0 && (
              // Per SESSION, not per day: this used to sit below the whole date and delete
              // every mark on it, so clearing the morning silently wiped the afternoon.
              // Distinct from "Remove session" above, which also drops the recorded hours.
              <form action={clearAttendanceAction} className="flex justify-end">
                <input type="hidden" name="class_id" value={course.id} />
                <input type="hidden" name="session_date" value={data.date} />
                <input type="hidden" name="session_id" value={session.id} />
                <ConfirmSubmit
                  className="btn btn-sm btn-ghost text-red-600"
                  title="Clear this session's marks?"
                  message="This removes every mark for THIS session only. Other sessions on this date, and the recorded times, are unaffected."
                  confirmLabel="Clear marks"
                  pendingLabel="Clearing..."
                >
                  Clear marks
                </ConfirmSubmit>
              </form>
            )}
          </div>
        ))}

        <div className="space-y-2">
          <SectionLabel>{sessionsForForm.length > 0 ? 'Record another session' : 'Record the session'}</SectionLabel>
          <SessionTimesForm classId={course.id} date={data.date} session={null} canEditStaffNote={canManageContent} />
        </div>

        <div className="max-w-xs">
          <StatCard
            label={daySessions.length > 1 ? `Total for ${daySessions.length} sessions` : 'Session length'}
            value={formatMinutes(dayMinutes)}
          />
        </div>

        {data.roster.length === 0 ? (
          <EmptyState>No students enrolled yet - add students on the People tab first.</EmptyState>
        ) : (
          <>
            {daySessions.length === 0 && (
              // No session recorded for this date yet - marking here records one, so the
              // marks still belong to a session.
              <MarkAttendanceForm classId={course.id} date={data.date} students={data.roster} session={dayWindow} />
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
                        <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-slate-600">
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
