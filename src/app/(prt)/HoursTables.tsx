import { Fragment } from 'react'
import Link from 'next/link'
import { formatMinutes } from '@/lib/attendance/hours'
import { workingMinutes, sumByKind, totalByKind } from '@/lib/attendance/hours-breakdown'
import type {
  MenteeHours,
  PersonHours,
  StudentHours,
  StudentLedgerRow,
  WorkLedgerRow,
} from '@/lib/services/hours-breakdown'
import { SESSION_KIND_LABELS, type SessionKind } from '@/lib/attendance/session-kind'
import { formatMonthLabel } from '@/lib/time/format'
import { Badge, CARD, attendanceTone, cx, statusLabel, roleLabelIfUnexpected } from '@/lib/ui'
import { LocalTime } from './LocalTime'

/**
 * The hours breakdown, as tables. Shared by every surface that shows it - the admin Class
 * hours report, a tutor's or student's My hours page, and a student's page under Mentoring - so
 * they all say the same thing the same way.
 *
 * Two shapes, because the two questions differ:
 *   StudentHoursView  hours RECEIVED  - regular, demo and exam as three separate columns
 *   PersonHoursView   hours WORKED    - regular, exam monitoring, their sum ("Working"), and demo
 *                                       on its own, since demo is never working time
 *
 * A zero prints as a dash: most cells in most rows are empty, and a column of "0m" hides the
 * figures that are there.
 */

const cell = (minutes: number) => (minutes > 0 ? formatMinutes(minutes) : '-')

function Head({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th scope="col" className={cx('p-2', right && 'text-right sm:w-24')}>
      {children}
    </th>
  )
}

function Num({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td className={cx('p-2 text-right tabular-nums', strong ? 'font-medium text-slate-800' : 'text-slate-600')}>
      {children}
    </td>
  )
}

function CountPill({ count, label }: { count: number; label: string }) {
  return (
    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
      {count} {label}
    </span>
  )
}

function ReceivedHeaders() {
  return (
    <>
      <Head right>Regular</Head>
      <Head right>Demo</Head>
      <Head right>Exam</Head>
    </>
  )
}

function ReceivedCells({
  minutes,
  strong = false,
}: {
  minutes: { regular: number; demo: number; exam: number }
  strong?: boolean
}) {
  return (
    <>
      <Num strong={strong}>{cell(minutes.regular)}</Num>
      <Num strong={strong}>{cell(minutes.demo)}</Num>
      <Num strong={strong}>{cell(minutes.exam)}</Num>
    </>
  )
}

function WorkedHeaders() {
  return (
    <>
      <Head right>Sessions</Head>
      <Head right>Regular</Head>
      <Head right>Exam</Head>
      <Head right>Demo</Head>
      <Head right>Working</Head>
    </>
  )
}

function WorkedCells({
  sessions,
  minutes,
  strong = false,
}: {
  sessions: { regular: number; demo: number; exam: number }
  minutes: { regular: number; demo: number; exam: number }
  strong?: boolean
}) {
  return (
    <>
      <Num strong={strong}>{totalByKind(sessions)}</Num>
      <Num strong={strong}>{cell(minutes.regular)}</Num>
      <Num strong={strong}>{cell(minutes.exam)}</Num>
      <Num strong={strong}>{cell(minutes.demo)}</Num>
      <Num strong={strong}>{cell(workingMinutes(minutes))}</Num>
    </>
  )
}

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-slate-600">{note}</p>}
      <div className={cx(CARD, 'mt-2 overflow-x-auto')}>{children}</div>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className={cx(CARD, 'min-w-[8rem] flex-1 p-3')}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{formatMinutes(value)}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  )
}

/** Hours RECEIVED by one student: subject, tutor and kind.
 *
 * `canLinkTutor` controls whether tutor names are rendered as clickable links
 * to the admin teaching-hours detail page. Pass `true` only when the viewer
 * holds `manageClasses` (admin/sub-admin); a student or mentor should see the
 * name as plain text since the target page would refuse them.
 */
export function StudentHoursView({ hours, canLinkTutor = false }: { hours: StudentHours; canLinkTutor?: boolean }) {
  /** Render a tutor name, optionally linked to their admin hours page. */
  function TutorName({ tutorId, tutorName }: { tutorId: string | null; tutorName: string }) {
    if (tutorId && canLinkTutor) {
      return (
        <Link
          prefetch={false}
          href={`/admin/teaching-hours/person/${tutorId}`}
          className="hover:text-primary hover:underline"
        >
          {tutorName}
        </Link>
      )
    }
    return <>{tutorName}</>
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Stat label="Regular" value={hours.total.regular} note={`${hours.sessions.regular} sessions`} />
        <Stat
          label="Demo"
          value={hours.total.demo}
          note={hours.sessions.demo > 0 ? `${hours.sessions.demo} sessions` : 'Reported separately'}
        />
        <Stat
          label="Exam"
          value={hours.total.exam}
          note={hours.sessions.exam > 0 ? `${hours.sessions.exam} exams` : 'Reported separately'}
        />
      </div>
      <Block title="By subject">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <Head>Subject</Head>
              <ReceivedHeaders />
            </tr>
          </thead>
          <tbody>
            {hours.bySubject.map((s) => (
              <Fragment key={s.subjectId ?? 'none'}>
                <tr className="border-t">
                  <td className="p-2 font-medium text-slate-800">
                    <span>{s.subjectName}</span>
                    {s.byTutor && s.byTutor.length === 1 && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        · <TutorName tutorId={s.byTutor[0].tutorId} tutorName={s.byTutor[0].tutorName} />
                      </span>
                    )}
                    {s.byTutor && s.byTutor.length > 1 && <CountPill count={s.byTutor.length} label="tutors" />}
                  </td>
                  <ReceivedCells minutes={s.minutes} strong />
                </tr>
                {s.byTutor &&
                  s.byTutor.length > 1 &&
                  s.byTutor.map((t) => (
                    <tr
                      key={`${s.subjectId ?? 'none'}-${t.tutorId ?? 'none'}`}
                      className="border-t border-slate-100 bg-slate-50/50 text-xs"
                    >
                      <td className="p-2 pl-6 text-slate-700">
                        <span className="mr-1.5 font-mono text-slate-500">↳</span>
                        <TutorName tutorId={t.tutorId} tutorName={t.tutorName} />
                      </td>
                      <ReceivedCells minutes={t.minutes} />
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-medium text-slate-700">
              <td className="p-2">Total</td>
              <ReceivedCells minutes={hours.total} strong />
            </tr>
          </tfoot>
        </table>
      </Block>
      <Block title="By tutor" note="The tutor each session was recorded against.">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <Head>Tutor</Head>
              <ReceivedHeaders />
            </tr>
          </thead>
          <tbody>
            {hours.byTutor.map((t) => (
              <Fragment key={t.tutorId ?? 'none'}>
                <tr className="border-t">
                  <td className="p-2 font-medium text-slate-800">
                    <TutorName tutorId={t.tutorId} tutorName={t.tutorName} />
                    {t.bySubject && t.bySubject.length === 1 && (
                      <span className="ml-2 text-xs font-normal text-slate-500">· {t.bySubject[0].subjectName}</span>
                    )}
                    {t.bySubject && t.bySubject.length > 1 && <CountPill count={t.bySubject.length} label="subjects" />}
                  </td>
                  <ReceivedCells minutes={t.minutes} strong />
                </tr>
                {t.bySubject &&
                  t.bySubject.length > 1 &&
                  t.bySubject.map((sub) => (
                    <tr
                      key={`${t.tutorId ?? 'none'}-${sub.subjectId ?? 'none'}`}
                      className="border-t border-slate-100 bg-slate-50/50 text-xs"
                    >
                      <td className="p-2 pl-6 text-slate-700">
                        <span className="mr-1.5 font-mono text-slate-500">↳</span>
                        {sub.subjectName}
                      </td>
                      <ReceivedCells minutes={sub.minutes} />
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-medium text-slate-700">
              <td className="p-2">Total</td>
              <ReceivedCells minutes={hours.total} strong />
            </tr>
          </tfoot>
        </table>
      </Block>
      {hours.total.exam > 0 && (
        <Block
          title="Exams monitored by"
          note="Who sat with the student for each exam - the tutor unless someone else was recorded."
        >
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <Head>Monitor</Head>
                <Head right>Exam hours</Head>
              </tr>
            </thead>
            <tbody>
              {hours.examMonitors.map((m) => (
                <tr key={m.monitorId ?? 'none'} className="border-t">
                  <td className="p-2 font-medium text-slate-800">{m.monitorName}</td>
                  <Num strong>{cell(m.minutes)}</Num>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}
    </div>
  )
}

/** Hours WORKED by one person: subject, student and kind.
 *
 * `canLinkStudent` controls whether student names link to their mentee detail
 * page. Pass `true` only when the viewer holds `viewMentees` (mentor or admin);
 * a plain tutor without mentee oversight should see the name as plain text.
 */
export function PersonHoursView({
  hours,
  month,
  canLinkStudent = false,
}: {
  hours: PersonHours
  month?: string
  canLinkStudent?: boolean
}) {
  const working = workingMinutes(hours.minutes)

  /** Render a student name, optionally linked to their detail page. */
  function StudentName({ studentId, studentName }: { studentId: string | null; studentName: string }) {
    if (studentId && canLinkStudent) {
      const href = month
        ? `/students/${studentId}?hoursMonth=${encodeURIComponent(month)}#hours`
        : `/students/${studentId}`
      return (
        <Link prefetch={false} href={href} className="hover:text-primary hover:underline">
          {studentName}
        </Link>
      )
    }
    return <>{studentName}</>
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Stat label="Working hours" value={working} note="Regular + exam monitoring" />
        <Stat label="Regular" value={hours.minutes.regular} note={`${hours.sessions.regular} sessions`} />
        <Stat label="Exam monitoring" value={hours.minutes.exam} note={`${hours.sessions.exam} exams`} />
        <Stat label="Demo" value={hours.minutes.demo} note="Not working time" />
      </div>
      <Block title="By subject">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <Head>Subject</Head>
              <WorkedHeaders />
            </tr>
          </thead>
          <tbody>
            {hours.bySubject.map((s) => (
              <Fragment key={s.subjectId ?? 'none'}>
                <tr className="border-t">
                  <td className="p-2 font-medium text-slate-800">
                    <span>{s.subjectName}</span>
                    {s.byStudent && s.byStudent.length === 1 && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        · <StudentName studentId={s.byStudent[0].studentId} studentName={s.byStudent[0].studentName} />
                      </span>
                    )}
                    {s.byStudent && s.byStudent.length > 1 && <CountPill count={s.byStudent.length} label="students" />}
                  </td>
                  <WorkedCells sessions={s.sessions} minutes={s.minutes} strong />
                </tr>
                {s.byStudent &&
                  s.byStudent.length > 1 &&
                  s.byStudent.map((stud) => (
                    <tr
                      key={`${s.subjectId ?? 'none'}-${stud.studentId ?? 'none'}`}
                      className="border-t border-slate-100 bg-slate-50/50 text-xs"
                    >
                      <td className="p-2 pl-6 text-slate-700">
                        <span className="mr-1.5 font-mono text-slate-500">↳</span>
                        <StudentName studentId={stud.studentId} studentName={stud.studentName} />
                      </td>
                      <WorkedCells sessions={stud.sessions} minutes={stud.minutes} />
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-medium text-slate-700">
              <td className="p-2">Total</td>
              <WorkedCells sessions={hours.sessions} minutes={hours.minutes} strong />
            </tr>
          </tfoot>
        </table>
      </Block>
      <Block
        title="By student"
        note="Regular leaves exam monitoring out; Working includes it. Demo is never part of Working."
      >
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <Head>Student</Head>
              <WorkedHeaders />
            </tr>
          </thead>
          <tbody>
            {hours.byStudent.map((s) => (
              <Fragment key={s.studentId ?? 'none'}>
                <tr className="border-t">
                  <td className="p-2 font-medium text-slate-800">
                    <StudentName studentId={s.studentId} studentName={s.studentName} />
                    {s.bySubject && s.bySubject.length === 1 && (
                      <span className="ml-2 text-xs font-normal text-slate-500">· {s.bySubject[0].subjectName}</span>
                    )}
                    {s.bySubject && s.bySubject.length > 1 && <CountPill count={s.bySubject.length} label="subjects" />}
                  </td>
                  <WorkedCells sessions={s.sessions} minutes={s.minutes} strong />
                </tr>
                {s.bySubject &&
                  s.bySubject.length > 1 &&
                  s.bySubject.map((sub) => (
                    <tr
                      key={`${s.studentId ?? 'none'}-${sub.subjectId ?? 'none'}`}
                      className="border-t border-slate-100 bg-slate-50/50 text-xs"
                    >
                      <td className="p-2 pl-6 text-slate-700">
                        <span className="mr-1.5 font-mono text-slate-500">↳</span>
                        {sub.subjectName}
                      </td>
                      <WorkedCells sessions={sub.sessions} minutes={sub.minutes} />
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-medium text-slate-700">
              <td className="p-2">Total</td>
              <WorkedCells sessions={hours.sessions} minutes={hours.minutes} strong />
            </tr>
          </tfoot>
        </table>
      </Block>
    </div>
  )
}

/* -------------------------------------------------------------------------------------- */
/* Ledgers - the sessions behind the totals                                               */
/* -------------------------------------------------------------------------------------- */

/** "10:00 - 11:30", or a dash for a session whose times were never recorded. */
function Window({ startAt, endAt }: { startAt: string | null; endAt: string | null }) {
  if (!startAt || !endAt) return <span className="text-slate-500">Times not recorded</span>
  return (
    <span className="whitespace-nowrap">
      <LocalTime iso={startAt} mode="time" /> - <LocalTime iso={endAt} mode="time" />
    </span>
  )
}

function KindCell({ kind, monitorName }: { kind: SessionKind; monitorName?: string | null }) {
  if (kind === 'regular') return <span className="text-slate-500">Regular</span>
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge tone={kind === 'exam' ? 'warning' : 'slate'}>{SESSION_KIND_LABELS[kind]}</Badge>
      {kind === 'exam' && monitorName && <span className="text-xs text-slate-500">Monitored by {monitorName}</span>}
    </span>
  )
}

/**
 * A student's month, session by session: date, time, length, subject, tutor, kind (and the
 * monitor of an exam), whether they attended, and when they actually joined. The sessions they
 * missed are listed too, with their length struck back to a dash in the hours - the totals above
 * are built from exactly the rows marked as counted.
 */
export function StudentLedger({
  rows,
  canLinkTutor = false,
}: {
  rows: readonly StudentLedgerRow[]
  canLinkTutor?: boolean
}) {
  if (rows.length === 0) return null
  return (
    <Block
      title="Session by session"
      note="Every session this month, oldest first. Hours count only where the student attended (present or late). Under a session you can read the class summary and the student's own feedback, where there is one."
    >
      <table aria-label="Sessions this month" className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <Head>Date</Head>
            <Head>Time</Head>
            <Head right>Length</Head>
            <Head>Subject</Head>
            <Head>Tutor</Head>
            <Head>Type</Head>
            <Head>Attendance</Head>
            <Head>Joined</Head>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.sessionId}>
              <tr className="border-t">
                <td className="whitespace-nowrap p-2 text-slate-600">{r.sessionDate ?? '-'}</td>
                <td className="p-2 text-slate-600">
                  <Window startAt={r.startAt} endAt={r.endAt} />
                </td>
                <td className={cx('p-2 text-right tabular-nums', r.counted ? 'text-slate-800' : 'text-slate-500')}>
                  {r.minutes > 0 ? formatMinutes(r.minutes) : '-'}
                </td>
                <td className="p-2 font-medium text-slate-800">
                  {r.classId ? (
                    <Link
                      prefetch={false}
                      href={`/classroom/${r.classId}`}
                      className="hover:text-primary hover:underline"
                    >
                      {r.subjectName}
                    </Link>
                  ) : (
                    r.subjectName
                  )}
                </td>
                <td className="p-2 text-slate-600">
                  {r.tutorId && canLinkTutor ? (
                    <Link
                      prefetch={false}
                      href={`/admin/teaching-hours/person/${r.tutorId}`}
                      className="hover:text-primary hover:underline"
                    >
                      {r.tutorName}
                    </Link>
                  ) : (
                    r.tutorName
                  )}
                </td>
                <td className="p-2 text-slate-600">
                  <KindCell kind={r.kind} monitorName={r.monitorName} />
                </td>
                <td className="p-2">
                  <Badge tone={attendanceTone(r.status)}>{statusLabel(r.status)}</Badge>
                </td>
                <td className="whitespace-nowrap p-2 text-slate-600">
                  {r.joinAt ? <LocalTime iso={r.joinAt} mode="time" /> : <span className="text-slate-500">-</span>}
                </td>
              </tr>
              {(r.summary || r.studentFeedback) && (
                <tr>
                  <td colSpan={8} className="px-2 pb-3 text-xs text-slate-600">
                    {r.summary && (
                      <p>
                        <span className="font-medium text-slate-700">Class summary: </span>
                        {r.summary}
                      </p>
                    )}
                    {r.studentFeedback && (
                      <p className={r.summary ? 'mt-1' : undefined}>
                        <span className="font-medium text-slate-700">Student feedback: </span>
                        {r.studentFeedback}
                      </p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Block>
  )
}

/** What a tutor or mentor worked, session by session: the classes they taught and the exams they
 *  monitored, with the students who attended. Adds up to the totals beside it. */
export function WorkLedger({ rows }: { rows: readonly WorkLedgerRow[] }) {
  if (rows.length === 0) return null
  return (
    <Block
      title="Session by session"
      note="Every session you taught or monitored this month, oldest first. Demo classes are listed but are not working time."
    >
      <table aria-label="Sessions this month" className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <Head>Date</Head>
            <Head>Time</Head>
            <Head right>Length</Head>
            <Head>Subject</Head>
            <Head>Student</Head>
            <Head>Type</Head>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sessionId} className="border-t">
              <td className="whitespace-nowrap p-2 text-slate-600">{r.sessionDate ?? '-'}</td>
              <td className="p-2 text-slate-600">
                <Window startAt={r.startAt} endAt={r.endAt} />
              </td>
              <td className="p-2 text-right tabular-nums text-slate-800">
                {r.minutes > 0 ? formatMinutes(r.minutes) : '-'}
              </td>
              <td className="p-2 font-medium text-slate-800">
                {r.classId ? (
                  <Link
                    prefetch={false}
                    href={`/classroom/${r.classId}`}
                    className="hover:text-primary hover:underline"
                  >
                    {r.subjectName}
                  </Link>
                ) : (
                  r.subjectName
                )}
              </td>
              <td className="p-2 text-slate-600">
                {r.studentNames.length > 0 ? (
                  r.studentNames.join(', ')
                ) : (
                  <span className="text-slate-500">No attendance</span>
                )}
              </td>
              <td className="p-2 text-slate-600">
                {r.kind === 'exam' ? (
                  <span className="inline-flex flex-col items-start gap-0.5">
                    <Badge tone="warning">Exam</Badge>
                    <span className="text-xs text-slate-500">
                      {r.role === 'monitored' ? 'You monitored it' : 'You taught it'}
                    </span>
                  </span>
                ) : (
                  <KindCell kind={r.kind} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Block>
  )
}

/**
 * Received hours table, one row per student or mentee.
 * Detailed breakdowns by subject and tutor are available in the dedicated detail panels below.
 */
export function ReceivedHoursTable({
  title = 'Hours received, by mentee',
  headerLabel = 'Student',
  rows,
  month,
  canLinkStudent = true,
  showTotal = false,
}: {
  title?: string
  headerLabel?: string
  rows: readonly (MenteeHours | StudentHours)[]
  month: string
  canLinkTutor?: boolean
  canLinkStudent?: boolean
  showTotal?: boolean
}) {
  if (rows.length === 0) return null
  const totalMins = showTotal ? sumByKind(rows.map((r) => r.total)) : null

  return (
    <div className={cx(CARD, 'mt-2 overflow-x-auto')}>
      <table aria-label={title} className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <Head>{headerLabel}</Head>
            <ReceivedHeaders />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.studentId} className="border-t bg-white">
              <td className="p-2 font-medium text-slate-800">
                {canLinkStudent ? (
                  <Link
                    prefetch={false}
                    className="text-primary hover:underline"
                    href={`/students/${r.studentId}?hoursMonth=${encodeURIComponent(month)}#hours`}
                    scroll={false}
                  >
                    {r.studentName}
                  </Link>
                ) : (
                  r.studentName
                )}
              </td>
              <ReceivedCells minutes={r.total} strong />
            </tr>
          ))}
        </tbody>
        {showTotal && totalMins && (
          <tfoot>
            <tr className="border-t-2 font-medium text-slate-700">
              <td className="p-2">Total - {formatMonthLabel(month)}</td>
              <ReceivedCells minutes={totalMins} strong />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

/**
 * A mentor's mentees, one row each: what each received this month as regular, demo and exam.
 * Every mentee is listed - a student with no sessions reads as dashes, not as missing - and the
 * name opens that mentee's full breakdown for the same month.
 */
export function MenteesHoursTable({
  rows,
  month,
  canLinkTutor = false,
}: {
  rows: readonly MenteeHours[]
  month: string
  canLinkTutor?: boolean
}) {
  return (
    <ReceivedHoursTable
      title="Hours received, by mentee"
      headerLabel="Mentee"
      rows={rows}
      month={month}
      canLinkTutor={canLinkTutor}
      canLinkStudent={true}
      showTotal={false}
    />
  )
}

/**
 * Worked hours table, one row per tutor / mentor.
 * Detailed breakdowns by subject and student are available in the dedicated detail panels below.
 */
export function WorkedHoursTable({
  people,
  month,
  showTotal = true,
}: {
  people: readonly PersonHours[]
  month: string
  canLinkStudent?: boolean
  showTotal?: boolean
}) {
  if (people.length === 0) return null
  const totalMins = showTotal ? sumByKind(people.map((p) => p.minutes)) : null
  const totalSess = showTotal ? sumByKind(people.map((p) => p.sessions)) : null

  return (
    <div className={cx(CARD, 'mt-3 overflow-x-auto')}>
      <table aria-label="Hours worked, by tutor and mentor" className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <Head>Tutor / mentor</Head>
            <WorkedHeaders />
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.personId ?? 'unassigned'} className="border-t bg-white">
              <td className="p-2 font-medium text-slate-800">
                <span className="inline-flex items-baseline gap-1.5">
                  {p.personId ? (
                    <Link
                      prefetch={false}
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
              <WorkedCells sessions={p.sessions} minutes={p.minutes} strong />
            </tr>
          ))}
        </tbody>
        {showTotal && (
          <tfoot>
            <tr className="border-t-2 font-medium text-slate-700">
              <td className="p-2">Total - {formatMonthLabel(month)}</td>
              <WorkedCells
                sessions={totalSess ?? { regular: 0, demo: 0, exam: 0 }}
                minutes={totalMins ?? { regular: 0, demo: 0, exam: 0 }}
                strong
              />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
