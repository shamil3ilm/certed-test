import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import {
  breakdownByPerson,
  breakdownByStudent,
  emptyByKind,
  ledgerForPerson,
  ledgerForStudent,
  sessionWorker,
  type BreakdownMark,
  type BreakdownSession,
  type ByKind,
  type LedgerMark,
  type MarkStatus,
  type PersonHoursRaw,
  type StudentHoursRaw,
} from '@/lib/attendance/hours-breakdown'
import type { SessionKind } from '@/lib/attendance/session-kind'
import {
  countSessionsWithoutTimes,
  selectAttendedForSessions,
  selectMarksForStudentInDates,
  selectSessionNotesByIds,
  selectSessionsByIdsInRange,
  selectSessionsForClassesInRange,
  selectSessionsWorkedByPersonInRange,
} from '@/lib/data/analytics'
import { selectArchivedClassIds } from '@/lib/data/classes'
import { selectActiveStudentIdsByClassIds } from '@/lib/data/class-membership'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { canMentor } from '@/lib/permission/mentor'
import { isMentoringOversight, mentoringScopeClassIds } from '@/lib/permission/class'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { requireActorCapability } from '@/lib/services/authorization'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { getProfileLabelsByIds } from '@/lib/services/users'
import { monthDateBounds, monthWindow } from '@/lib/time/month-window'
import { PermissionError } from '@/lib/errors'

/**
 * The monthly hours breakdown, by kind of session: what each STUDENT received and what each
 * PERSON worked. This module reads and authorises; the rules for whose time a session is live
 * in the pure engine (@/lib/attendance/hours-breakdown), where they are tested.
 *
 * It sits BESIDE the teaching-hours report rather than inside it. That report is what receipts
 * and pay slips are drafted from, and what a demo or an exam should bill is not decided yet -
 * so the figures billing reads are deliberately left exactly as they were, and this reports
 * the same sessions with the kind visible.
 *
 * WHO SEES WHAT, enforced here rather than in a page:
 *   academy-wide (every tutor, every student)  manageClasses - admin and sub-admin
 *   one person's own hours worked              that person, and only them
 *   one student's hours received               the student, their mentor, or an admin/sub-admin
 */

export interface SubjectHours {
  subjectId: string | null
  subjectName: string
  minutes: ByKind
}

export interface StudentHours {
  studentId: string
  studentName: string
  total: ByKind
  bySubject: SubjectHours[]
  byTutor: Array<{ tutorId: string | null; tutorName: string; minutes: ByKind }>
  /** Exam minutes by who actually monitored them. */
  examMonitors: Array<{ monitorId: string | null; monitorName: string; minutes: number }>
}

export interface PersonHours {
  personId: string | null
  personName: string
  /** The person's role, so a mentor credited with teaching reads as one. */
  personRole: string | null
  minutes: ByKind
  sessions: ByKind
  bySubject: SubjectHours[]
  byStudent: Array<{ studentId: string | null; studentName: string; minutes: ByKind }>
}

export interface HoursBreakdown {
  month: string
  /** Sessions dated in the month that have no recorded times: they exist (attendance was marked)
   *  but no report can count their hours. Only the academy-wide view fills this in. */
  untimedSessions?: number
  people: PersonHours[]
  students: StudentHours[]
}

const UNASSIGNED = 'Unassigned'
export const NO_SUBJECT = 'No subject set'
const NO_ATTENDANCE = 'No attendance recorded'

/** Every id a set of raw rows names, so names are read in one batch. */
function profileIdsIn(people: readonly PersonHoursRaw[], students: readonly StudentHoursRaw[]): string[] {
  const ids = new Set<string>()
  for (const p of people) {
    if (p.personId) ids.add(p.personId)
    for (const s of p.byStudent) if (s.studentId) ids.add(s.studentId)
  }
  for (const s of students) {
    ids.add(s.studentId)
    for (const t of s.byTutor) if (t.tutorId) ids.add(t.tutorId)
    for (const m of s.examMonitors) if (m.monitorId) ids.add(m.monitorId)
  }
  return [...ids]
}

function subjectIdsIn(people: readonly PersonHoursRaw[], students: readonly StudentHoursRaw[]): string[] {
  const ids = new Set<string>()
  for (const p of people) for (const s of p.bySubject) if (s.subjectId) ids.add(s.subjectId)
  for (const s of students) for (const sub of s.bySubject) if (sub.subjectId) ids.add(sub.subjectId)
  return [...ids]
}

/** Raw rows (ids only) -> rows a page can print (names resolved), in two batched reads. */
async function nameThem(
  people: readonly PersonHoursRaw[],
  students: readonly StudentHoursRaw[],
): Promise<{ people: PersonHours[]; students: StudentHours[] }> {
  const profileIds = profileIdsIn(people, students)
  const subjectIds = subjectIdsIn(people, students)
  const [labels, subjects] = await Promise.all([
    profileIds.length
      ? getProfileLabelsByIds(profileIds)
      : Promise.resolve(new Map<string, { name: string; role: string }>()),
    subjectIds.length ? selectSubjectsByIds(subjectIds) : Promise.resolve([]),
  ])
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))
  const nameOf = (id: string | null, fallback: string) => (id ? (labels.get(id)?.name ?? 'Unknown') : fallback)
  const subjectsOf = (rows: ReadonlyArray<{ subjectId: string | null; minutes: ByKind }>): SubjectHours[] =>
    rows.map((r) => ({
      subjectId: r.subjectId,
      subjectName: r.subjectId ? (subjectName.get(r.subjectId) ?? NO_SUBJECT) : NO_SUBJECT,
      minutes: r.minutes,
    }))

  return {
    people: people.map((p) => ({
      personId: p.personId,
      personName: nameOf(p.personId, UNASSIGNED),
      personRole: p.personId ? (labels.get(p.personId)?.role ?? null) : null,
      minutes: p.minutes,
      sessions: p.sessions,
      bySubject: subjectsOf(p.bySubject),
      byStudent: p.byStudent.map((s) => ({
        studentId: s.studentId,
        studentName: nameOf(s.studentId, NO_ATTENDANCE),
        minutes: s.minutes,
      })),
    })),
    students: students.map((s) => ({
      studentId: s.studentId,
      studentName: nameOf(s.studentId, 'Unknown student'),
      total: s.total,
      bySubject: subjectsOf(s.bySubject),
      byTutor: s.byTutor.map((t) => ({
        tutorId: t.tutorId,
        tutorName: nameOf(t.tutorId, UNASSIGNED),
        minutes: t.minutes,
      })),
      examMonitors: s.examMonitors.map((m) => ({
        monitorId: m.monitorId,
        monitorName: nameOf(m.monitorId, UNASSIGNED),
        minutes: m.minutes,
      })),
    })),
  }
}

async function windowFor(month: string): Promise<{ startIso: string; endIso: string }> {
  return monthWindow(month, await getInstituteTimeZone())
}

/** 'YYYY-MM-DD' shifted by whole days (UTC arithmetic: only calendar dates are involved). */
function shiftDate(isoOrDate: string, days: number): string {
  const d = new Date(`${isoOrDate.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * ADMIN / SUB-ADMIN: the whole academy's month - every person's hours worked and every
 * student's hours received, from the same sessions. Archived classes are left out, as in the
 * Class hours report this sits beside, so the two never disagree about which sessions exist.
 */
export async function getAcademyBreakdown(actorId: string, month: string): Promise<HoursBreakdown> {
  await requireActorCapability(actorId, 'manageClasses', 'You are not allowed to view academy-wide hours.')
  const { startIso, endIso } = await windowFor(month)
  const archived = await selectArchivedClassIds()
  const [sessions, untimedSessions] = await Promise.all([
    selectSessionsForClassesInRange(null, startIso, endIso, archived),
    countSessionsWithoutTimes(...monthDateBounds(month), archived),
  ])
  if (sessions.length === 0) return { month, untimedSessions, people: [], students: [] }
  const marks = await selectAttendedForSessions(sessions.map((s) => s.id))
  const named = await nameThem(breakdownByPerson(sessions, marks), breakdownByStudent(sessions, marks))
  return { month, untimedSessions, ...named }
}

/* -------------------------------------------------------------------------------------- */
/* Ledgers: the sessions behind the totals                                                */
/* -------------------------------------------------------------------------------------- */

export interface StudentLedgerRow {
  sessionId: string
  sessionDate: string | null
  startAt: string | null
  endAt: string | null
  minutes: number
  subjectName: string
  tutorName: string
  kind: SessionKind
  /** Who monitored an exam when it was not the tutor; null otherwise. */
  monitorName: string | null
  status: MarkStatus
  joinAt: string | null
  leaveAt: string | null
  /** Whether these minutes are part of the student's hours (present or late, not absent). */
  counted: boolean
  /** What the tutor wrote up for the class, and the student's own feedback on it. Only for a
   *  session the student attended: a session they missed is not theirs to read about, here or
   *  anywhere else. Never the private staff note. */
  summary: string | null
  studentFeedback: string | null
}

export interface WorkLedgerRow {
  sessionId: string
  classId: string
  sessionDate: string | null
  startAt: string | null
  endAt: string | null
  minutes: number
  subjectName: string
  kind: SessionKind
  role: 'taught' | 'monitored'
  studentNames: string[]
}

/** Names for the people and subjects a set of ledger rows mention, in two batched reads. */
async function ledgerNames(profileIds: string[], subjectIds: string[]) {
  const [labels, subjects] = await Promise.all([
    profileIds.length
      ? getProfileLabelsByIds([...new Set(profileIds)])
      : Promise.resolve(new Map<string, { name: string; role: string }>()),
    subjectIds.length ? selectSubjectsByIds([...new Set(subjectIds)]) : Promise.resolve([]),
  ])
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))
  return {
    person: (id: string | null, fallback: string) => (id ? (labels.get(id)?.name ?? 'Unknown') : fallback),
    subject: (id: string | null) => (id ? (subjectName.get(id) ?? NO_SUBJECT) : NO_SUBJECT),
  }
}

const idsOf = (xs: ReadonlyArray<string | null | undefined>): string[] => xs.filter((x): x is string => Boolean(x))

/* -------------------------------------------------------------------------------------- */
/* One person's own work                                                                  */
/* -------------------------------------------------------------------------------------- */

export interface MyWork {
  hours: PersonHours
  ledger: WorkLedgerRow[]
}

/**
 * TUTOR / MENTOR: the actor's OWN month - what they taught and the exams they monitored - as
 * totals AND as the sessions behind them, or null when they worked none. Never anyone else's:
 * the read is keyed on the actor's id, not on a parameter, so there is no path to ask for a
 * colleague.
 */
export async function getMyWork(actor: Profile, month: string): Promise<MyWork | null> {
  return workOf(actor.id, month)
}

/**
 * ADMIN / SUB-ADMIN: one named person's month, session by session - the same view that person
 * has of their own hours. Gated on the academy-wide capability the Class hours report already
 * needs, because it names a colleague.
 */
export async function getPersonWork(actorId: string, personId: string, month: string): Promise<MyWork | null> {
  await requireActorCapability(actorId, 'manageClasses', 'You are not allowed to view academy-wide hours.')
  return workOf(personId, month)
}

/** A person's month as totals and as the sessions behind them. The callers decide WHOSE it may be. */
async function workOf(personId: string, month: string): Promise<MyWork | null> {
  const { startIso, endIso } = await windowFor(month)
  const archived = new Set(await selectArchivedClassIds())
  const sessions = (await selectSessionsWorkedByPersonInRange(personId, startIso, endIso)).filter(
    (s) => !archived.has(s.class_id),
  )
  // An exam this person taught but someone else monitored is that monitor's working time.
  const mine = sessions.filter((s) => sessionWorker(s) === personId)
  if (mine.length === 0) return null
  const marks = await selectAttendedForSessions(mine.map((s) => s.id))
  const [own] = breakdownByPerson(mine, marks)
  const hours = (await nameThem([own], [])).people[0]
  if (!hours) return null

  const raw = ledgerForPerson(personId, mine, marks)
  const names = await ledgerNames(
    raw.flatMap((r) => r.studentIds),
    idsOf(raw.map((r) => r.subjectId)),
  )
  return {
    hours,
    ledger: raw.map((r) => ({
      sessionId: r.sessionId,
      classId: r.classId,
      sessionDate: r.sessionDate,
      startAt: r.startAt,
      endAt: r.endAt,
      minutes: r.minutes,
      subjectName: names.subject(r.subjectId),
      kind: r.kind,
      role: r.role,
      studentNames: r.studentIds.map((id) => names.person(id, 'Unknown student')),
    })),
  }
}

/** The totals half of getMyWork, for callers that do not show the sessions. */
export async function getMyHoursWorked(actor: Profile, month: string): Promise<PersonHours | null> {
  return (await getMyWork(actor, month))?.hours ?? null
}

/* -------------------------------------------------------------------------------------- */
/* One student's month                                                                    */
/* -------------------------------------------------------------------------------------- */

/** May `actor` read this student's hours? The student; their mentor (or an admin) by mentor
 *  authority; or a sub-admin, who has academy-wide authority over classes but is not a mentor. */
async function canViewStudentHours(actor: Profile, studentId: string): Promise<boolean> {
  if (actor.id === studentId) return true
  if (await canMentor(actor, studentId)) return true
  return (await loadPersonaFlags(actor.id)).isSubAdmin
}

export interface StudentMonth {
  /** Totals by subject, tutor and kind; null when the student has no session that month. */
  hours: StudentHours | null
  /** Every session they have a mark for, absences included, oldest first. */
  ledger: StudentLedgerRow[]
}

/**
 * One student's month: the hours they RECEIVED by subject, tutor and kind, and the sessions
 * behind them. Authorised here: the student, their mentor, or an admin / sub-admin.
 *
 * Marks are dated by session_date and sessions by their recorded start, which can fall on
 * different calendar days at a month edge (and across midnight in the institute's zone). Reading
 * marks a day either side and then keeping only the sessions that START in the month is what
 * makes the month boundary the sessions', exactly as in every other hours report.
 */
export async function getStudentMonth(actor: Profile, studentId: string, month: string): Promise<StudentMonth> {
  if (!(await canViewStudentHours(actor, studentId))) {
    throw new PermissionError('Not allowed to view this student’s hours.')
  }
  const { startIso, endIso } = await windowFor(month)
  const allMarks = await selectMarksForStudentInDates(studentId, shiftDate(startIso, -1), shiftDate(endIso, 1))
  const sessions = await selectSessionsByIdsInRange([...new Set(allMarks.map((m) => m.session_id))], startIso, endIso)
  const archived = new Set(await selectArchivedClassIds())
  const inScope: BreakdownSession[] = sessions.filter((s) => !archived.has(s.class_id))
  const inScopeIds = new Set(inScope.map((s) => s.id))
  const marks: LedgerMark[] = allMarks.filter((m) => inScopeIds.has(m.session_id))
  if (marks.length === 0) return { hours: null, ledger: [] }

  // Hours are built from the marks that count; the ledger shows all of them.
  const attended: BreakdownMark[] = marks.filter((m) => m.status !== 'absent')
  const raw = breakdownByStudent(inScope, attended)[0] ?? {
    studentId,
    total: emptyByKind(),
    bySubject: [],
    byTutor: [],
    examMonitors: [],
  }
  const hours = (await nameThem([], [raw])).students[0] ?? null

  const rows = ledgerForStudent(inScope, marks)
  const names = await ledgerNames(
    idsOf(rows.flatMap((r) => [r.tutorId, r.monitorId])),
    idsOf(rows.map((r) => r.subjectId)),
  )
  const notes = await selectSessionNotesByIds(rows.filter((r) => r.counted).map((r) => r.sessionId))
  return {
    hours,
    ledger: rows.map((r) => ({
      sessionId: r.sessionId,
      sessionDate: r.sessionDate,
      startAt: r.startAt,
      endAt: r.endAt,
      minutes: r.minutes,
      subjectName: names.subject(r.subjectId),
      tutorName: names.person(r.tutorId, UNASSIGNED),
      kind: r.kind,
      monitorName: r.monitorId ? names.person(r.monitorId, UNASSIGNED) : null,
      status: r.status,
      joinAt: r.joinAt,
      leaveAt: r.leaveAt,
      counted: r.counted,
      summary: notes.get(r.sessionId)?.summary ?? null,
      studentFeedback: notes.get(r.sessionId)?.student_feedback ?? null,
    })),
  }
}

/**
 * One student's hours RECEIVED in a month - the totals half of getStudentMonth, or null when
 * they have no session that month. Same authority.
 */
export async function getStudentHoursReceived(
  actor: Profile,
  studentId: string,
  month: string,
): Promise<StudentHours | null> {
  return (await getStudentMonth(actor, studentId, month)).hours
}

/* -------------------------------------------------------------------------------------- */
/* A mentor's mentees                                                                     */
/* -------------------------------------------------------------------------------------- */

export interface MenteeHours {
  studentId: string
  studentName: string
  total: ByKind
}

/**
 * MENTOR: one row per mentee with the hours they received this month, regular / demo / exam -
 * every mentee, including one with no sessions, so a quiet month is visible rather than absent.
 * Scoped to the mentee classes the actor has mentor authority over. An oversight reader (admin,
 * sub-admin) has no mentees of their own and reads the whole academy on Class hours instead, so
 * they get nothing here.
 */
export async function getMenteesHoursReceived(actor: Profile, month: string): Promise<MenteeHours[]> {
  if (await isMentoringOversight(actor.id)) return []
  const classIds = await mentoringScopeClassIds(actor)
  if (classIds.length === 0) return []
  const studentIds = [...new Set(await selectActiveStudentIdsByClassIds(classIds))]
  if (studentIds.length === 0) return []

  const { startIso, endIso } = await windowFor(month)
  const sessions = await selectSessionsForClassesInRange(classIds, startIso, endIso)
  const marks = sessions.length > 0 ? await selectAttendedForSessions(sessions.map((s) => s.id)) : []
  const totals = new Map(breakdownByStudent(sessions, marks).map((s) => [s.studentId, s.total]))
  const labels = await getProfileLabelsByIds(studentIds)
  return studentIds
    .map((id) => ({
      studentId: id,
      studentName: labels.get(id)?.name ?? 'Unknown student',
      total: totals.get(id) ?? emptyByKind(),
    }))
    .sort((a, b) => a.studentName.localeCompare(b.studentName))
}
