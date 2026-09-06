import 'server-only'
import { requireActorCapability } from '@/lib/services/authorization'
import type { Profile } from '@/lib/auth/profile'
import { minutesBetween } from '@/lib/attendance/hours'
import { monthWindow } from '@/lib/time/month-window'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import {
  selectAttendedForSessions,
  selectSessionsForClassesInRange,
  type AttendedRow,
  type SessionHoursRow,
} from '@/lib/data/analytics'
import { mentoringScopeClassIds } from '@/lib/permission/class'
import { myClassIds } from '@/lib/services/classes'
import { selectActiveClassIds, selectActiveClassIdsAmong, selectClassesByIds } from '@/lib/data/classes'
import { getProfileNamesByIds } from '@/lib/services/users'

/**
 * Monthly teaching-hours reporting - ONE calculation, three authorization scopes.
 *
 * Hours are the recorded session window (class_sessions.actual_start -> actual_end),
 * summed for a calendar month whose boundaries are the INSTITUTE timezone's month edges
 * (see monthWindow). The class SCOPE is the only thing that differs between roles:
 *   - a tutor sees their own classes' total (getTutorPersonalHours),
 *   - a mentor sees ONLY the classes their mentees are enrolled in, per tutor (getClassTutorHours),
 *   - an admin/sub-admin sees every class from BOTH sides (getAcademyClassHours): hours
 *     taught, per tutor, and hours received, per student, from the very same session rows,
 *     so the two halves of that report can never disagree about which sessions exist.
 *
 * Isolation is enforced SERVER-SIDE by which class ids enter the query - never by filtering
 * a global tutor total in the UI. Grouping by class_sessions.tutor_id keeps a tutor's Class-1
 * hours separate from their Class-2 hours, so a Class-1 mentor can never see the Class-2 total.
 */

export interface TutorHours {
  /** null when the session had no recorded tutor (shown as "Unassigned"). */
  tutorId: string | null
  tutorName: string
  minutes: number
  sessionCount: number
}

export interface ClassTutorHours {
  classId: string
  className: string
  totalMinutes: number
  tutors: TutorHours[]
}

interface RawGroup {
  classId: string
  tutorId: string | null
  minutes: number
  sessionCount: number
}

/** PURE: group rows by (class, tutor), summing minutesBetween(actual_start, actual_end);
 *  a null tutor_id is its own bucket. Exported for unit tests (the isolation invariant). */
export function aggregateClassTutorHours(rows: readonly SessionHoursRow[]): RawGroup[] {
  const byKey = new Map<string, RawGroup>()
  for (const r of rows) {
    const key = `${r.class_id}:${r.tutor_id ?? ''}`
    const group = byKey.get(key) ?? {
      classId: r.class_id,
      tutorId: r.tutor_id ?? null,
      minutes: 0,
      sessionCount: 0,
    }
    group.minutes += minutesBetween(r.actual_start, r.actual_end) ?? 0
    group.sessionCount += 1
    byKey.set(key, group)
  }
  return [...byKey.values()]
}

/** Resolve class + tutor names and fold into per-class rows, sorted for display. */
async function shapeClassTutorHours(groups: RawGroup[]): Promise<ClassTutorHours[]> {
  const classIds = [...new Set(groups.map((g) => g.classId))]
  const tutorIds = [...new Set(groups.map((g) => g.tutorId).filter((id): id is string => id != null))]
  const [classes, names] = await Promise.all([
    classIds.length ? selectClassesByIds(classIds) : Promise.resolve([]),
    tutorIds.length ? getProfileNamesByIds(tutorIds) : Promise.resolve(new Map<string, string>()),
  ])
  const classNameById = new Map(classes.map((c) => [c.id, c.name]))
  const byClass = new Map<string, ClassTutorHours>()
  for (const g of groups) {
    const entry = byClass.get(g.classId) ?? {
      classId: g.classId,
      className: classNameById.get(g.classId) ?? 'Unknown class',
      totalMinutes: 0,
      tutors: [],
    }
    entry.tutors.push({
      tutorId: g.tutorId,
      tutorName: g.tutorId ? (names.get(g.tutorId) ?? 'Unknown tutor') : 'Unassigned',
      minutes: g.minutes,
      sessionCount: g.sessionCount,
    })
    entry.totalMinutes += g.minutes
    byClass.set(g.classId, entry)
  }
  const result = [...byClass.values()]
  for (const c of result) c.tutors.sort((a, b) => b.minutes - a.minutes)
  return result.sort((a, b) => a.className.localeCompare(b.className))
}

async function windowFor(month: string): Promise<{ startIso: string; endIso: string }> {
  return monthWindow(month, await getInstituteTimeZone())
}

/**
 * MENTOR view: per-tutor teaching hours for each class the mentor's mentees are enrolled
 * in, for `month` ('YYYY-MM'). Class-scoped to `mentorAuthorityClassIds` - a tutor's other
 * classes' sessions never enter the query, so their hours cannot leak.
 */
export async function getClassTutorHours(actor: Profile, month: string): Promise<ClassTutorHours[]> {
  // Same scope as the session-timings list this panel sits beside: a mentor's mentee
  // classes, or every active class for an oversight actor. Resolving it differently here
  // is what left the hours panel blank for an admin on a page whose rows were populated.
  const classIds = await mentoringScopeClassIds(actor)
  if (classIds.length === 0) return []
  const { startIso, endIso } = await windowFor(month)
  const rows = await selectSessionsForClassesInRange(classIds, startIso, endIso)
  return shapeClassTutorHours(aggregateClassTutorHours(rows))
}

export interface PersonalHours {
  month: string
  minutes: number
  sessionCount: number
}

/**
 * TUTOR view: the actor's own teaching hours for `month`, across their classes - the
 * monthly counterpart of the lifetime dashboard tile (same "all sessions in my classes"
 * basis, bounded to the month).
 */
export async function getTutorPersonalHours(actor: Profile, month: string): Promise<PersonalHours> {
  const classIds = await selectActiveClassIdsAmong(await myClassIds(actor))
  if (classIds.length === 0) return { month, minutes: 0, sessionCount: 0 }
  const { startIso, endIso } = await windowFor(month)
  // Only sessions attributed to THIS tutor - a co-taught class must not leak a colleague's
  // hours into your personal total, matching the module's isolation invariant.
  const mine = (await selectSessionsForClassesInRange(classIds, startIso, endIso)).filter(
    (r) => r.tutor_id === actor.id,
  )
  const minutes = mine.reduce((total, r) => total + (minutesBetween(r.actual_start, r.actual_end) ?? 0), 0)
  return { month, minutes, sessionCount: mine.length }
}

/* ------------------------------------------------------------------------------------
 * Per-person roll-up, and the STUDENT side of the academy report (admin / sub-admin).
 * ---------------------------------------------------------------------------------- */

export interface PersonHours {
  /** null is the "Unassigned" bucket - sessions recorded with no tutor. */
  personId: string | null
  personName: string
  minutes: number
  sessionCount: number
  classCount: number
}

/**
 * PURE: fold the per-class x tutor rows into ONE row per tutor/mentor.
 *
 * The class x tutor breakdown answers "who taught this class", but a tutor running three
 * classes appears as three rows that nothing adds up - so the figure an admin actually
 * wants for workload or payroll was the one number the report never showed. Exported for
 * unit tests. Sorted by minutes desc, so the heaviest load reads first.
 */
export function rollUpPersonHours(classes: readonly ClassTutorHours[]): PersonHours[] {
  const byPerson = new Map<string, PersonHours>()
  for (const c of classes) {
    for (const t of c.tutors) {
      const key = t.tutorId ?? ''
      const entry = byPerson.get(key) ?? {
        personId: t.tutorId,
        personName: t.tutorName,
        minutes: 0,
        sessionCount: 0,
        classCount: 0,
      }
      entry.minutes += t.minutes
      entry.sessionCount += t.sessionCount
      // Upstream emits one row per (class, tutor), so each visit here is a distinct class.
      entry.classCount += 1
      byPerson.set(key, entry)
    }
  }
  return [...byPerson.values()].sort((a, b) => b.minutes - a.minutes || a.personName.localeCompare(b.personName))
}

export interface StudentHours {
  studentId: string
  studentName: string
  minutes: number
  sessionCount: number
}

export interface ClassStudentHours {
  classId: string
  className: string
  totalMinutes: number
  students: StudentHours[]
}

interface RawStudentGroup {
  classId: string
  studentId: string
  minutes: number
  sessionCount: number
}

/**
 * PURE: hours of class DELIVERED TO each student, per class.
 *
 * A student is credited with a SESSION's recorded window when their attendance for that
 * session is present or late. Since 0094 each mark names the session it belongs to, so a
 * student who attended the morning of a two-session day is credited the morning only -
 * which is the honest answer, and one the old per-day key could not give.
 *
 * Consequences worth knowing when reading a number:
 *   - a session with no recorded window adds 0 minutes but still counts as attended
 *     (minutesBetween returns null -> 0, exactly as on the tutor side);
 *   - a mark for a session outside the reporting window contributes nothing - the caller
 *     only ever passes marks for the sessions it fetched;
 *   - 'absent' never reaches here, being filtered in the query.
 *
 * Exported for unit tests.
 */
export function aggregateClassStudentHours(
  sessions: readonly SessionHoursRow[],
  attended: readonly AttendedRow[],
): RawStudentGroup[] {
  // session id -> the class it belongs to and the minutes it recorded.
  const bySession = new Map<string, { classId: string; minutes: number }>()
  for (const session of sessions) {
    bySession.set(session.id, {
      classId: session.class_id,
      minutes: minutesBetween(session.actual_start, session.actual_end) ?? 0,
    })
  }

  const byStudent = new Map<string, RawStudentGroup>()
  for (const mark of attended) {
    const session = bySession.get(mark.session_id)
    if (!session) continue
    const key = `${session.classId}:${mark.student_id}`
    const group = byStudent.get(key) ?? {
      classId: session.classId,
      studentId: mark.student_id,
      minutes: 0,
      sessionCount: 0,
    }
    group.minutes += session.minutes
    group.sessionCount += 1
    byStudent.set(key, group)
  }
  return [...byStudent.values()]
}

/** Resolve class + student names and fold into per-class rows, sorted for display. */
async function shapeClassStudentHours(groups: RawStudentGroup[]): Promise<ClassStudentHours[]> {
  const classIds = [...new Set(groups.map((g) => g.classId))]
  const studentIds = [...new Set(groups.map((g) => g.studentId))]
  const [classes, names] = await Promise.all([
    classIds.length ? selectClassesByIds(classIds) : Promise.resolve([]),
    studentIds.length ? getProfileNamesByIds(studentIds) : Promise.resolve(new Map<string, string>()),
  ])
  const classNameById = new Map(classes.map((c) => [c.id, c.name]))
  const byClass = new Map<string, ClassStudentHours>()
  for (const g of groups) {
    const entry = byClass.get(g.classId) ?? {
      classId: g.classId,
      className: classNameById.get(g.classId) ?? 'Unknown class',
      totalMinutes: 0,
      students: [],
    }
    entry.students.push({
      studentId: g.studentId,
      studentName: names.get(g.studentId) ?? 'Unknown student',
      minutes: g.minutes,
      sessionCount: g.sessionCount,
    })
    entry.totalMinutes += g.minutes
    byClass.set(g.classId, entry)
  }
  const result = [...byClass.values()]
  for (const c of result) c.students.sort((a, b) => b.minutes - a.minutes || a.studentName.localeCompare(b.studentName))
  return result.sort((a, b) => a.className.localeCompare(b.className))
}

export interface AcademyClassHours {
  /** One row per tutor/mentor, summed across their classes. */
  personTotals: PersonHours[]
  /** The class x tutor detail behind those totals. */
  tutorClasses: ClassTutorHours[]
  /** Class hours delivered to each student, per class. */
  studentClasses: ClassStudentHours[]
}

/**
 * ADMIN / SUB-ADMIN view: the whole academy's recorded hours for `month`, from BOTH sides
 * - who taught them, and which students received them.
 *
 * One session read serves every figure here. Deriving the student side from its own query
 * would let the two halves drift apart (a session landing between the two reads would be
 * counted for a tutor but not for their students) and would pay twice for the same rows.
 *
 * Sub-admins see the same academy-wide figures as admins: 0092 gave that persona
 * academy-wide authority over class-scoped tables, with no per-class subset to respect.
 */
export async function getAcademyClassHours(actorId: string, month: string): Promise<AcademyClassHours> {
  // Actor-scoped like its two siblings (getClassTutorHours, getTutorPersonalHours), which
  // both narrow to the caller's classes. This one is academy-wide, so it re-checks the
  // capability instead - manageClasses is reason-required precisely because this report
  // spans every tutor and student.
  await requireActorCapability(actorId, 'manageClasses', 'You are not allowed to view academy-wide hours.')
  const classIds = await selectActiveClassIds()
  if (classIds.length === 0) return { personTotals: [], tutorClasses: [], studentClasses: [] }
  const { startIso, endIso } = await windowFor(month)
  const sessions = await selectSessionsForClassesInRange(classIds, startIso, endIso)
  if (sessions.length === 0) return { personTotals: [], tutorClasses: [], studentClasses: [] }

  // Only the sessions actually in the window need an attendance lookup.
  const attended = await selectAttendedForSessions(sessions.map((s) => s.id))

  const [tutorClasses, studentClasses] = await Promise.all([
    shapeClassTutorHours(aggregateClassTutorHours(sessions)),
    shapeClassStudentHours(aggregateClassStudentHours(sessions, attended)),
  ])
  return { personTotals: rollUpPersonHours(tutorClasses), tutorClasses, studentClasses }
}
