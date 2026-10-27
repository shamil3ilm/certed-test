import { minutesBetween } from '@/lib/attendance/hours'
import { kindOf, type SessionKind } from '@/lib/attendance/session-kind'

/**
 * The hours breakdown - PURE. Given a month's sessions and who attended them, it answers the
 * two questions the academy asks of the same rows:
 *
 *   per STUDENT  how much did they RECEIVE, by subject, by tutor, and of which kind?
 *   per PERSON   how much did they WORK, by subject, by student, and of which kind?
 *
 * Both are cut by `kind` because the three kinds are not interchangeable:
 *
 *   regular  working time of the session's tutor; hours received by the student
 *   demo     reported on its own, and NEVER working time
 *   exam     working time of whoever MONITORED it - the tutor unless another person was named
 *
 * A session's minutes are its recorded window, exactly as the existing teaching-hours report
 * counts them (minutesBetween, null -> 0), so a session with no window still counts as a
 * session of zero minutes. Nothing here is rounded: callers format.
 */

export type ByKind = Record<SessionKind, number>

export const emptyByKind = (): ByKind => ({ regular: 0, demo: 0, exam: 0 })

/** Working time: regular teaching plus exam monitoring. Demo is deliberately absent. */
export function workingMinutes(minutes: ByKind): number {
  return minutes.regular + minutes.exam
}

/** The columns of a session this module reads. Wider rows are fine - SessionHoursRow is one. */
export interface BreakdownSession {
  id: string
  class_id: string
  /** The calendar date the session was recorded against; used only by the ledgers. */
  session_date?: string | null
  tutor_id: string | null
  /** Who monitored an exam when it was not the tutor (0123). */
  monitor_id?: string | null
  subject_id: string | null
  /** Absent on rows from before 0123 and in mock mode; read as 'regular'. */
  kind?: SessionKind | null
  actual_start: string | null
  actual_end: string | null
}

/** One attendance mark that counts: the student was present or late for the session. */
export interface BreakdownMark {
  session_id: string
  student_id: string
}

/** The person whose WORKING time a session is. null is the "Unassigned" bucket. */
export function sessionWorker(session: BreakdownSession): string | null {
  if (kindOf(session) === 'exam') return session.monitor_id ?? session.tutor_id ?? null
  return session.tutor_id ?? null
}

function minutesOf(session: BreakdownSession): number {
  return minutesBetween(session.actual_start, session.actual_end) ?? 0
}

/** Add `minutes` of `kind` to the bucket for `key`, creating it on first use. */
function addTo(map: Map<string | null, ByKind>, key: string | null, kind: SessionKind, minutes: number): void {
  const bucket = map.get(key) ?? emptyByKind()
  bucket[kind] += minutes
  map.set(key, bucket)
}

function total(minutes: ByKind): number {
  return minutes.regular + minutes.demo + minutes.exam
}

/** Map -> rows, the largest bucket first so the reader meets the weight first. */
function rowsOf<T extends string>(
  map: Map<string | null, ByKind>,
  idKey: T,
): Array<Record<T, string | null> & { minutes: ByKind }> {
  return [...map.entries()]
    .map(([id, minutes]) => ({ [idKey]: id, minutes }) as Record<T, string | null> & { minutes: ByKind })
    .sort((a, b) => total(b.minutes) - total(a.minutes))
}

/* -------------------------------------------------------------------------------------- */
/* Per student - hours RECEIVED                                                           */
/* -------------------------------------------------------------------------------------- */

export interface StudentHoursRaw {
  studentId: string
  total: ByKind
  bySubject: Array<{ subjectId: string | null; minutes: ByKind }>
  /** The tutor each session was attributed to. For an exam this is the class tutor, which is
   *  not necessarily who monitored it - see examMonitors. */
  byTutor: Array<{ tutorId: string | null; minutes: ByKind }>
  /** Exam minutes by the person who actually monitored them, so an exam someone other than
   *  the tutor watched is visible as such. */
  examMonitors: Array<{ monitorId: string | null; minutes: number }>
}

/**
 * Hours each student RECEIVED: a student is credited with a session's recorded window when
 * they were marked present or late for it (the caller passes only those marks - 'absent'
 * never reaches here). A mark for a session outside `sessions` contributes nothing.
 */
export function breakdownByStudent(
  sessions: readonly BreakdownSession[],
  marks: readonly BreakdownMark[],
): StudentHoursRaw[] {
  const bySession = new Map(sessions.map((s) => [s.id, s]))
  const students = new Map<
    string,
    {
      total: ByKind
      subjects: Map<string | null, ByKind>
      tutors: Map<string | null, ByKind>
      monitors: Map<string | null, number>
    }
  >()

  for (const mark of marks) {
    const session = bySession.get(mark.session_id)
    if (!session) continue
    const kind = kindOf(session)
    const minutes = minutesOf(session)
    const entry = students.get(mark.student_id) ?? {
      total: emptyByKind(),
      subjects: new Map<string | null, ByKind>(),
      tutors: new Map<string | null, ByKind>(),
      monitors: new Map<string | null, number>(),
    }
    entry.total[kind] += minutes
    addTo(entry.subjects, session.subject_id ?? null, kind, minutes)
    addTo(entry.tutors, session.tutor_id ?? null, kind, minutes)
    if (kind === 'exam') {
      const monitor = sessionWorker(session)
      entry.monitors.set(monitor, (entry.monitors.get(monitor) ?? 0) + minutes)
    }
    students.set(mark.student_id, entry)
  }

  return [...students.entries()]
    .map(([studentId, e]) => ({
      studentId,
      total: e.total,
      bySubject: rowsOf(e.subjects, 'subjectId'),
      byTutor: rowsOf(e.tutors, 'tutorId'),
      examMonitors: [...e.monitors.entries()]
        .map(([monitorId, minutes]) => ({ monitorId, minutes }))
        .sort((a, b) => b.minutes - a.minutes),
    }))
    .sort((a, b) => total(b.total) - total(a.total) || a.studentId.localeCompare(b.studentId))
}

/* -------------------------------------------------------------------------------------- */
/* Per person - hours WORKED                                                              */
/* -------------------------------------------------------------------------------------- */

export interface PersonHoursRaw {
  /** null is the "Unassigned" bucket: sessions with no tutor and no monitor. */
  personId: string | null
  /** regular = taught; exam = monitored; demo = reported separately. workingMinutes() adds
   *  the first two. */
  minutes: ByKind
  sessions: ByKind
  bySubject: Array<{ subjectId: string | null; minutes: ByKind }>
  /** The students those hours were spent with. null is "nobody was marked present or late" -
   *  kept as its own row so the student rows still add up to the person's total. */
  byStudent: Array<{ studentId: string | null; minutes: ByKind }>
}

/**
 * Hours each person WORKED, from the sessions' side. A session's minutes go to ONE person
 * (sessionWorker), so across people every recorded minute is placed exactly once.
 *
 * `byStudent` credits the whole session to each student who attended it. A class has one
 * student (enforced), so that is one row per session; if history ever holds two marks on a
 * session the student rows can exceed the person's total, which is why the total is carried
 * separately rather than derived from them.
 */
export function breakdownByPerson(
  sessions: readonly BreakdownSession[],
  marks: readonly BreakdownMark[],
): PersonHoursRaw[] {
  const attendeesBySession = new Map<string, string[]>()
  for (const mark of marks) {
    const list = attendeesBySession.get(mark.session_id) ?? []
    list.push(mark.student_id)
    attendeesBySession.set(mark.session_id, list)
  }

  const people = new Map<
    string,
    {
      personId: string | null
      minutes: ByKind
      sessions: ByKind
      subjects: Map<string | null, ByKind>
      students: Map<string | null, ByKind>
    }
  >()

  for (const session of sessions) {
    const kind = kindOf(session)
    const minutes = minutesOf(session)
    const worker = sessionWorker(session)
    const key = worker ?? ''
    const entry = people.get(key) ?? {
      personId: worker,
      minutes: emptyByKind(),
      sessions: emptyByKind(),
      subjects: new Map<string | null, ByKind>(),
      students: new Map<string | null, ByKind>(),
    }
    entry.minutes[kind] += minutes
    entry.sessions[kind] += 1
    addTo(entry.subjects, session.subject_id ?? null, kind, minutes)
    const attendees = attendeesBySession.get(session.id)
    if (attendees && attendees.length > 0) {
      for (const studentId of attendees) addTo(entry.students, studentId, kind, minutes)
    } else {
      addTo(entry.students, null, kind, minutes)
    }
    people.set(key, entry)
  }

  return [...people.values()]
    .map((e) => ({
      personId: e.personId,
      minutes: e.minutes,
      sessions: e.sessions,
      bySubject: rowsOf(e.subjects, 'subjectId'),
      byStudent: rowsOf(e.students, 'studentId'),
    }))
    .sort(
      (a, b) =>
        workingMinutes(b.minutes) - workingMinutes(a.minutes) || (a.personId ?? '').localeCompare(b.personId ?? ''),
    )
}

/* -------------------------------------------------------------------------------------- */
/* Ledgers - the sessions behind the totals                                               */
/* -------------------------------------------------------------------------------------- */

export type MarkStatus = 'present' | 'late' | 'absent'

/** A student's mark on one session, with the times they actually joined and left. */
export interface LedgerMark extends BreakdownMark {
  status: MarkStatus
  join_at: string | null
  leave_at: string | null
}

export interface StudentLedgerRaw {
  sessionId: string
  /** The calendar date the session was recorded against. */
  sessionDate: string | null
  startAt: string | null
  endAt: string | null
  minutes: number
  subjectId: string | null
  /** The tutor the session was recorded against. */
  tutorId: string | null
  kind: SessionKind
  /** Who monitored an exam, or null when the tutor did (and for every other kind). */
  monitorId: string | null
  status: MarkStatus
  joinAt: string | null
  leaveAt: string | null
  /** Whether these minutes count towards the student's hours: present or late, not absent. */
  counted: boolean
}

/** Oldest first; a session with no recorded start sorts last, then by id so the order is total. */
function byStart<T extends { startAt: string | null; sessionId: string }>(a: T, b: T): number {
  if (a.startAt !== b.startAt) {
    if (a.startAt == null) return 1
    if (b.startAt == null) return -1
    return a.startAt.localeCompare(b.startAt)
  }
  return a.sessionId.localeCompare(b.sessionId)
}

/**
 * One student's month, session by session: every session they have a mark for - the ones they
 * missed as well as the ones they attended - with its kind, tutor, monitor and their own join
 * time. `counted` says which rows the student's hours are built from, so the ledger and the
 * totals can be read against each other and always agree.
 */
export function ledgerForStudent(
  sessions: readonly BreakdownSession[],
  marks: readonly LedgerMark[],
): StudentLedgerRaw[] {
  const bySession = new Map(sessions.map((s) => [s.id, s]))
  const rows: StudentLedgerRaw[] = []
  for (const mark of marks) {
    const session = bySession.get(mark.session_id)
    if (!session) continue
    const kind = kindOf(session)
    rows.push({
      sessionId: session.id,
      sessionDate: session.session_date ?? null,
      startAt: session.actual_start,
      endAt: session.actual_end,
      minutes: minutesOf(session),
      subjectId: session.subject_id ?? null,
      tutorId: session.tutor_id ?? null,
      kind,
      monitorId: kind === 'exam' ? (session.monitor_id ?? null) : null,
      status: mark.status,
      joinAt: mark.join_at,
      leaveAt: mark.leave_at,
      counted: mark.status !== 'absent',
    })
  }
  return rows.sort(byStart)
}

export interface PersonLedgerRaw {
  sessionId: string
  sessionDate: string | null
  startAt: string | null
  endAt: string | null
  minutes: number
  subjectId: string | null
  kind: SessionKind
  /** 'monitored' for an exam someone else (this person) watched; 'taught' otherwise. */
  role: 'taught' | 'monitored'
  /** The students who attended (present or late); empty when nobody was marked. */
  studentIds: string[]
}

/**
 * What one person worked, session by session: the classes they taught and the exams they
 * monitored, oldest first. Exactly the sessions breakdownByPerson credits to them, so the
 * ledger adds up to their totals.
 */
export function ledgerForPerson(
  personId: string,
  sessions: readonly BreakdownSession[],
  attended: readonly BreakdownMark[],
): PersonLedgerRaw[] {
  const attendees = new Map<string, string[]>()
  for (const m of attended) attendees.set(m.session_id, [...(attendees.get(m.session_id) ?? []), m.student_id])
  return sessions
    .filter((s) => sessionWorker(s) === personId)
    .map((s): PersonLedgerRaw => ({
      sessionId: s.id,
      sessionDate: s.session_date ?? null,
      startAt: s.actual_start,
      endAt: s.actual_end,
      minutes: minutesOf(s),
      subjectId: s.subject_id ?? null,
      kind: kindOf(s),
      role: kindOf(s) === 'exam' && s.monitor_id && s.monitor_id !== s.tutor_id ? 'monitored' : 'taught',
      studentIds: attendees.get(s.id) ?? [],
    }))
    .sort((a, b) =>
      byStart({ startAt: a.startAt, sessionId: a.sessionId }, { startAt: b.startAt, sessionId: b.sessionId }),
    )
}
