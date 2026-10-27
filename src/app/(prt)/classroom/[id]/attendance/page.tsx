import { requireClassAccess } from '../../access'
import { canEditStaffNote } from '@/lib/permission'
import {
  attendanceHistoryPageUrl,
  attendanceRecordPageUrl,
  loadClassAttendancePageData,
} from '@/lib/services/page-data/class-attendance'
import { MarkAttendanceForm } from './MarkAttendanceForm'
import { SessionTimesForm } from './SessionTimesForm'
import { SessionFeedbackForm } from './SessionFeedbackForm'
import { clearAttendanceAction, deleteSessionAction, nameClassSubjectAction } from './actions'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import { LocalTime } from '../../../LocalTime'
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
  attendanceTone,
  statusLabel,
} from '@/lib/ui'
import {
  formatMinutes,
  minutesBetween,
  sessionMetrics,
  studentMetrics,
  type SessionTimes,
} from '@/lib/attendance/hours'
import { SESSION_KIND_LABELS, kindOf } from '@/lib/attendance/session-kind'

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
              // THIS mark's session. A day can hold several, each with its own mark, so showing the day's
              // summaries under every row repeated one session's text under each of them.
              const own = daySessions.find((x) => x.id === row.session_id) ?? null
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
                      {/* This mark's own session, when it was a demo or an exam, says so - so the
                          hours beside it are read as what they were. Regular is the unmarked case. */}
                      {own && kindOf(own) !== 'regular' && (
                        <Badge tone={kindOf(own) === 'exam' ? 'warning' : 'slate'}>
                          {SESSION_KIND_LABELS[kindOf(own)]}
                        </Badge>
                      )}
                      {learning != null && <span className="text-xs text-slate-600">{formatMinutes(learning)}</span>}
                      <Badge tone={attendanceTone(row.status)}>{statusLabel(row.status)}</Badge>
                    </span>
                  </div>
                  <details className="border-t border-slate-100 px-4 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-primary transition hover:underline">
                      Summary &amp; feedback
                    </summary>
                    {own?.summary ? (
                      <div className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Tutor&apos;s summary
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{own.summary}</p>
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
  // Resolved from the one definition the WRITE also uses (permission/staff-note.ts), so the
  // field this form hides is exactly the field the service will refuse to write.
  const canManageContent = await canEditStaffNote()
  const rosterBySession = new Map(data.sessionRosters.map((r) => [r.session.id, r.roster]))
  const sessionsForForm = canManageContent
    ? daySessions
    : daySessions.map((session) => ({ ...session, staff_note: null }))

  // Class-level warnings: both decide whose hours a recorded session becomes and how it is
  // labelled, so they show whether or not the record form is folded away.
  const classWarnings = (
    <>
      {!data.classSubjectName && (
        // Surfaced at the point it starts costing something, and fixable there too.
        // Stamping happens at INSERT, so sessions recorded while this is unset stay
        // unlabelled - absent from the subject filter and the by-subject hours breakdown.
        <div className="space-y-2 rounded-lg border border-warning-border bg-warning-surface/60 px-3 py-2 text-xs text-warning-ink">
          <p>
            This class has no subject set, so sessions recorded here will not appear under any subject filter or in the
            by-subject hours breakdown.
          </p>
          {/* Fixed HERE, by whoever records the sessions. Sending them off to find an admin
                    is what leaves a class unlabelled for months, and naming the subject of a class
                    you already record is the same authority as recording it. A choice from the
                    managed list rather than free text: adding to the academy's subject catalogue
                    is a separate thing, and stays with an admin. */}
          <form action={nameClassSubjectAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="class_id" value={course.id} />
            <input type="hidden" name="session_date" value={data.date} />
            <label className="sr-only" htmlFor="set-class-subject">
              Subject for this class
            </label>
            <select
              id="set-class-subject"
              name="subject_id"
              required
              defaultValue=""
              className="rounded-lg border border-warning-border bg-white px-2 py-1 text-xs text-slate-800"
            >
              <option value="" disabled>
                Choose the subject...
              </option>
              {data.subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-sm btn-soft">
              Set subject
            </button>
          </form>
          <p>Sessions already recorded here are labelled with it too; nothing else changes.</p>
        </div>
      )}
      {!data.classHasTutor && (
        // The same shape as the subject warning, and the more expensive one: a session
        // records WHO taught it from the class's assigned tutors, stamped at insert. With
        // nobody assigned it stamps null, those hours land in the "Unassigned" bucket the
        // payslip drafts are built from, and assigning a tutor later does not go back and
        // claim them.
        //
        // No control offered here, unlike the subject above. Naming what a class teaches
        // is within the authority of whoever records it; putting a person on a class
        // grants them that class's data and its pay, which is an admin's decision - so
        // this one really does have to say "an admin".
        <p className="rounded-lg border border-warning-border bg-warning-surface/60 px-3 py-2 text-xs text-warning-ink">
          Nobody is assigned to teach this class, so hours recorded here are credited to no one and will show as
          &ldquo;Unassigned&rdquo; in the teaching-hours report. Assigning a tutor does not claim hours already
          recorded, so it is worth doing before this session. An admin can assign one on the student&rsquo;s Subjects
          &amp; tutors panel.
        </p>
      )}
    </>
  )

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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionLabel>Mark attendance</SectionLabel>
          {/* Only for a day that needs adding up. One session already states its own length in
              its times box, so repeating it here would say the same thing twice. */}
          {daySessions.length > 1 && (
            <p className="text-xs text-slate-600">
              <strong className="font-semibold text-slate-800">{formatMinutes(dayMinutes)}</strong> across{' '}
              {daySessions.length} sessions
            </p>
          )}
        </div>

        {searchParams?.error === '1' && (
          <AlertBanner>That change couldn&apos;t be applied. Please check the date and try again.</AlertBanner>
        )}

        {data.cancelledAs && (
          <AlertBanner tone="warning">
            The calendar says this class was cancelled on this date (&ldquo;{data.cancelledAs}&rdquo;). If it went ahead
            after all, record it as usual; otherwise there is nothing to record.
          </AlertBanner>
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

        {sessionsForForm.map((session, index) => {
          const tutorName = session.tutor_id ? (data.tutorNames.get(session.tutor_id) ?? null) : null
          const hasTimes = Boolean(session.actual_start && session.actual_end)
          return (
            // One card per session, holding everything that belongs to it - its window, who
            // taught it, its roster. On a two-session day the rosters otherwise sat in
            // sequence below their times forms, and nothing said which roster was which.
            <article
              key={session.id}
              className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4"
            >
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-900">
                    {/* The window IS the session's name: it is what tells this one apart from
                        the other on the same day, so it heads the card rather than sitting
                        inside a form below it. */}
                    {hasTimes ? (
                      <>
                        <LocalTime iso={session.actual_start as string} mode="time" />
                        {' - '}
                        <LocalTime iso={session.actual_end as string} mode="time" />
                        {/* The length stays in view once Times & notes folds away. It is the figure
                            Class hours bills, and folding must not be what hides it. */}
                        <span className="font-normal text-slate-600">
                          {' '}
                          &middot; {formatMinutes(sessionMetrics(session).sessionMinutes)}
                        </span>
                      </>
                    ) : (
                      'Times not recorded yet'
                    )}
                  </h3>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>
                      Session {index + 1} of {sessionsForForm.length}
                    </span>
                    {tutorName && <span>&middot; {tutorName}</span>}
                    {/* The SESSION's subject, stamped when it was recorded (0104) - so a class
                        re-pointed to a new subject keeps its history labelled correctly. */}
                    {session.subject_id && <Badge>{data.subjectNames.get(session.subject_id) ?? 'Subject'}</Badge>}
                    {/* A demo or an exam says so up here: it is not working time (demo) or is
                        credited to its monitor (exam), and the reader should not have to open the
                        form to find out which kind of hour this is. */}
                    {kindOf(session) !== 'regular' && (
                      <Badge tone={kindOf(session) === 'exam' ? 'warning' : 'slate'}>
                        {SESSION_KIND_LABELS[kindOf(session)]}
                      </Badge>
                    )}
                    {kindOf(session) === 'exam' && session.monitor_id && (
                      <span>&middot; monitored by {data.monitorNames.get(session.monitor_id) ?? 'another person'}</span>
                    )}
                  </p>
                </div>
                <form action={deleteSessionAction}>
                  <input type="hidden" name="class_id" value={course.id} />
                  <input type="hidden" name="session_id" value={session.id} />
                  <input type="hidden" name="session_date" value={data.date} />
                  <ConfirmSubmit
                    className="btn btn-sm btn-ghost text-danger-ink"
                    title="Remove this session?"
                    message="Every attendance mark for this session is deleted with it, and its hours drop out of the monthly total. Other sessions on this date are unaffected."
                    confirmLabel="Remove session"
                    pendingLabel="Removing..."
                  >
                    Remove session
                  </ConfirmSubmit>
                </form>
              </header>

              {/* Times are the exception once recorded - the window already heads the card -
                  so they fold away. Open when they are missing, since then they are the job. */}
              <details open={!hasTimes} className="group rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-700 transition hover:text-primary">
                  Times &amp; notes
                </summary>
                <div className="border-t border-slate-100 p-3">
                  <SessionTimesForm
                    classId={course.id}
                    date={data.date}
                    session={session}
                    canEditStaffNote={canManageContent}
                    monitorOptions={data.monitorOptions}
                    canChooseMonitor={data.canChooseMonitor}
                    bare
                  />
                </div>
              </details>

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
                // Per SESSION, not per day: a date can hold several sessions, so a control scoped
                // to the whole day would wipe the afternoon when someone clears the morning.
                // Distinct from "Remove session" above, which also drops the recorded hours.
                <form action={clearAttendanceAction} className="flex justify-end">
                  <input type="hidden" name="class_id" value={course.id} />
                  <input type="hidden" name="session_date" value={data.date} />
                  <input type="hidden" name="session_id" value={session.id} />
                  <ConfirmSubmit
                    className="btn btn-sm btn-ghost text-danger-ink"
                    title="Clear this session's marks?"
                    message="This removes every mark for THIS session only. Other sessions on this date, and the recorded times, are unaffected."
                    confirmLabel="Clear marks"
                    pendingLabel="Clearing..."
                  >
                    Clear marks
                  </ConfirmSubmit>
                </form>
              )}
            </article>
          )
        })}

        <div className="space-y-2">
          {sessionsForForm.length > 0 ? (
            <>
              {/* Class-level warnings stay in view: they decide whose hours these are and how
                  they are labelled, for the sessions above as much as for the next one. */}
              {classWarnings}
              {/* A second session is the exception, so it folds away until asked for. The first
                  one never does - with no session recorded, this form IS the session. */}
              <details className="rounded-xl border border-dashed border-slate-300 bg-white">
                <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2 px-3 py-2 text-sm font-medium text-primary">
                  + Record another session
                  {data.classSubjectName && <Badge>{data.classSubjectName}</Badge>}
                </summary>
                <div className="border-t border-slate-100 p-3">
                  <SessionTimesForm
                    classId={course.id}
                    date={data.date}
                    session={null}
                    canEditStaffNote={canManageContent}
                    monitorOptions={data.monitorOptions}
                    canChooseMonitor={data.canChooseMonitor}
                    bare
                  />
                </div>
              </details>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <SectionLabel>Record the session</SectionLabel>
                {/* Say WHAT this will be recorded as before it is recorded. A tutor teaching
                    several subjects is on one class per subject, so the only thing separating
                    "the Physics hour" from "the Maths hour" is which class they are on. */}
                {data.classSubjectName && <Badge>{data.classSubjectName}</Badge>}
              </div>
              {classWarnings}
              <SessionTimesForm
                classId={course.id}
                date={data.date}
                session={null}
                canEditStaffNote={canManageContent}
                monitorOptions={data.monitorOptions}
                canChooseMonitor={data.canChooseMonitor}
              />
            </>
          )}
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

        {data.historyTotal === 0 ? (
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
                    Session
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
                      <td className="whitespace-nowrap text-slate-600">
                        {/* Which session the mark belongs to. A day can hold several (0094), so
                            the date alone cannot say whether this was the morning or the
                            afternoon - and "late" means nothing without what it was late for. */}
                        {row.session_start && row.session_end ? (
                          <>
                            <LocalTime iso={row.session_start} mode="time" />
                            {' - '}
                            <LocalTime iso={row.session_end} mode="time" />
                          </>
                        ) : (
                          <span className="text-slate-600">Times not recorded</span>
                        )}
                        {row.tutor_name && <span className="block text-xs text-slate-500">{row.tutor_name}</span>}
                      </td>
                      <td className="whitespace-nowrap text-slate-600">{row.name}</td>
                      <td className="whitespace-nowrap">
                        <Badge tone={attendanceTone(row.status)}>{statusLabel(row.status)}</Badge>
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

        {/* The details view is a FILTERED history, so it needs a pager as much as a total:
            without one it showed a silent newest-200 under a heading that reads as the whole
            record, and filtering to "absent" across a year searched only the recent slice. */}
        <PaginationBar
          page={data.historyPage}
          totalPages={data.historyTotalPages}
          total={data.historyTotal}
          label="records"
          previousHref={
            data.historyPage > 1
              ? attendanceHistoryPageUrl(data.date, data.historyFilters, data.historyPage - 1)
              : undefined
          }
          nextHref={
            data.historyPage < data.historyTotalPages
              ? attendanceHistoryPageUrl(data.date, data.historyFilters, data.historyPage + 1)
              : undefined
          }
        />
      </section>
    </div>
  )
}
