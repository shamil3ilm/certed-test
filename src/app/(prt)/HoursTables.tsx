import { Fragment } from 'react'
import { formatMinutes } from '@/lib/attendance/hours'
import { workingMinutes, type ByKind } from '@/lib/attendance/hours-breakdown'
import type {
  MenteeHours,
  PersonHours,
  StudentHours,
  StudentLedgerRow,
  WorkLedgerRow,
} from '@/lib/services/hours-breakdown'
import { SESSION_KIND_LABELS, type SessionKind } from '@/lib/attendance/session-kind'
import { Badge, CARD, attendanceTone, cx, statusLabel } from '@/lib/ui'
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

/** Hours RECEIVED by one student: subject, tutor and kind. */
export function StudentHoursView({ hours }: { hours: StudentHours }) {
  const rows = (items: ReadonlyArray<{ key: string; label: string; minutes: ByKind }>, heading: string) => (
    <table className="data-table w-full text-sm">
      <thead>
        <tr className="text-left text-slate-600">
          <Head>{heading}</Head>
          <Head right>Regular</Head>
          <Head right>Demo</Head>
          <Head right>Exam</Head>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.key} className="border-t">
            <td className="p-2 font-medium text-slate-800">{r.label}</td>
            <Num strong>{cell(r.minutes.regular)}</Num>
            <Num>{cell(r.minutes.demo)}</Num>
            <Num>{cell(r.minutes.exam)}</Num>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 font-medium text-slate-700">
          <td className="p-2">Total</td>
          <Num strong>{cell(hours.total.regular)}</Num>
          <Num strong>{cell(hours.total.demo)}</Num>
          <Num strong>{cell(hours.total.exam)}</Num>
        </tr>
      </tfoot>
    </table>
  )

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Stat label="Regular" value={hours.total.regular} note="Class hours" />
        <Stat label="Demo" value={hours.total.demo} note="Reported separately" />
        <Stat label="Exam" value={hours.total.exam} note="Reported separately" />
      </div>
      <Block title="By subject">
        {rows(
          hours.bySubject.map((s) => ({ key: s.subjectId ?? 'none', label: s.subjectName, minutes: s.minutes })),
          'Subject',
        )}
      </Block>
      <Block title="By tutor" note="The tutor each session was recorded against.">
        {rows(
          hours.byTutor.map((t) => ({ key: t.tutorId ?? 'none', label: t.tutorName, minutes: t.minutes })),
          'Tutor',
        )}
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

/** Hours WORKED by one person: subject, student and kind. */
export function PersonHoursView({ hours }: { hours: PersonHours }) {
  const working = workingMinutes(hours.minutes)
  const rows = (items: ReadonlyArray<{ key: string; label: string; minutes: ByKind }>, heading: string) => (
    <table className="data-table w-full text-sm">
      <thead>
        <tr className="text-left text-slate-600">
          <Head>{heading}</Head>
          <Head right>Regular</Head>
          <Head right>Exam</Head>
          <Head right>Working</Head>
          <Head right>Demo</Head>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.key} className="border-t">
            <td className="p-2 font-medium text-slate-800">{r.label}</td>
            <Num>{cell(r.minutes.regular)}</Num>
            <Num>{cell(r.minutes.exam)}</Num>
            <Num strong>{cell(workingMinutes(r.minutes))}</Num>
            <Num>{cell(r.minutes.demo)}</Num>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 font-medium text-slate-700">
          <td className="p-2">Total</td>
          <Num strong>{cell(hours.minutes.regular)}</Num>
          <Num strong>{cell(hours.minutes.exam)}</Num>
          <Num strong>{cell(working)}</Num>
          <Num strong>{cell(hours.minutes.demo)}</Num>
        </tr>
      </tfoot>
    </table>
  )

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Stat label="Working hours" value={working} note="Regular + exam monitoring" />
        <Stat label="Regular" value={hours.minutes.regular} note={`${hours.sessions.regular} sessions`} />
        <Stat label="Exam monitoring" value={hours.minutes.exam} note={`${hours.sessions.exam} exams`} />
        <Stat label="Demo" value={hours.minutes.demo} note="Not working time" />
      </div>
      <Block title="By subject">
        {rows(
          hours.bySubject.map((s) => ({ key: s.subjectId ?? 'none', label: s.subjectName, minutes: s.minutes })),
          'Subject',
        )}
      </Block>
      <Block
        title="By student"
        note="Regular leaves exam monitoring out; Working includes it. Demo is never part of Working."
      >
        {rows(
          hours.byStudent.map((s) => ({ key: s.studentId ?? 'none', label: s.studentName, minutes: s.minutes })),
          'Student',
        )}
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
export function StudentLedger({ rows }: { rows: readonly StudentLedgerRow[] }) {
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
                <td className="p-2 font-medium text-slate-800">{r.subjectName}</td>
                <td className="p-2 text-slate-600">{r.tutorName}</td>
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
              <td className="p-2 font-medium text-slate-800">{r.subjectName}</td>
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
 * A mentor's mentees, one row each: what each received this month as regular, demo and exam.
 * Every mentee is listed - a student with no sessions reads as dashes, not as missing - and the
 * name opens that mentee's full breakdown for the same month.
 */
export function MenteesHoursTable({ rows, month }: { rows: readonly MenteeHours[]; month: string }) {
  if (rows.length === 0) return null
  return (
    <div className={cx(CARD, 'mt-2 overflow-x-auto')}>
      <table aria-label="Hours received, by mentee" className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <Head>Mentee</Head>
            <Head right>Regular</Head>
            <Head right>Demo</Head>
            <Head right>Exam</Head>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.studentId} className="border-t">
              <td className="p-2 font-medium text-slate-800">
                <a
                  className="text-primary hover:underline"
                  href={`/students/${r.studentId}?hoursMonth=${encodeURIComponent(month)}#hours`}
                >
                  {r.studentName}
                </a>
              </td>
              <Num strong>{cell(r.total.regular)}</Num>
              <Num>{cell(r.total.demo)}</Num>
              <Num>{cell(r.total.exam)}</Num>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
