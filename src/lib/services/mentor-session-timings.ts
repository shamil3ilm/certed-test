import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { mentoringScopeClassIds, canManageClass, isMentoringOversight } from '@/lib/permission/class'
import { selectClassesByIds, selectArchivedClassIds } from '@/lib/data/classes'
import { assertClassActive } from '@/lib/permission'
import { isCalendarDate } from '@/lib/time/format'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import {
  selectActiveEnrollmentRefsByClassIds,
  selectActiveEnrollmentPairsByStudentIds,
} from '@/lib/data/class-membership'
import { toRange, type Page } from '@/lib/pagination'
import { getProfileNamesByIds } from '@/lib/services/users'
import {
  selectSessionsForDate,
  selectSessionByIdAsService,
  type ClassSessionRow,
  selectSessionPage,
  updateSessionActualTimesAsService,
  type SessionPageFilter,
} from '@/lib/data/class-sessions'
import { selectJoinRowsForSessionsAsService, updateJoinAtAsService } from '@/lib/data/attendance'
import { resolveSessionWindow } from '@/lib/attendance/session-window'
import { assertNoTutorOverlap } from '@/lib/services/attendance/session-overlap'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

/**
 * The mentor session-timing list and its narrow "edit student joined time" write.
 *
 * REUSES existing columns only - start = class_sessions.actual_start, student entry
 * = attendance.join_at, end = class_sessions.actual_end (the same actual window the
 * session-times form records). Authorization reuses canManageClass (a mentor of a
 * class's mentee already passes it); the edit touches ONLY the student entry time.
 */

export type MenteeSessionTiming = {
  /** The recorded session's own id - what an edit targets. Never null: attendance.session_id
   *  is NOT NULL (0094), so every row IS a session (see listMenteeSessionTimings for why a
   *  mark without a session cannot exist). */
  sessionId: string
  classId: string
  className: string
  /** The subject the SESSION recorded (class_sessions.subject_id, 0104) - what was
   *  taught, not what the class teaches today. Re-pointing a class at another subject
   *  therefore leaves past sessions reading as they were. Null for a session recorded
   *  against a class that had no subject. */
  subject: string | null
  studentId: string
  studentName: string
  /** The tutor RECORDED on the session (class_sessions.tutor_id) - historical
   *  attribution, not the class's current tutor. Null when the session left it unset
   *  (or the class had no assigned tutor), surfaced as "Unassigned". */
  tutorId: string | null
  tutorName: string | null
  sessionDate: string
  startAt: string | null
  studentEntryAt: string | null
  endAt: string | null
  /** The session row's updated_at, echoed back by the editor for the optimistic lock; null
   *  when only an attendance row exists (no session recorded yet). */
  updatedAt: string | null
}

/** How far BEFORE the recorded session start a student entry may legitimately fall - a
 *  student waiting in the room before the tutor starts is normal, so the entry time is
 *  bounded by a grace window rather than pinned at/after the start. */
const EARLY_JOIN_GRACE_MINUTES = 60

/** What the reader may narrow the list to. All four are columns on class_sessions, so they
 *  become part of the SQL query rather than a pass over rows already fetched. */
export type SessionTimingFilters = {
  /** Narrow to one student, expressed as THEIR class ids (a student has a handful, so
   *  this stays a short `.in()`). Intersected with the reader's scope, never substituted
   *  for it - a mentor filtering by a student outside their mentees must still see
   *  nothing. An empty array therefore means "no matches", not "no filter". */
  studentClassIds?: string[]
  classId?: string
  subjectId?: string
  tutorId?: string
  /** Inclusive 'YYYY-MM-DD' bounds on session_date. */
  from?: string
  to?: string
}

/**
 * The class scope clause for this actor, as a filter the query can apply.
 *
 * A MENTOR is scoped to their mentee classes - a bounded set (their mentee count), so it
 * travels as an inclusion list. An OVERSIGHT reader (admin / sub-admin) sees every class,
 * and listing them all would put one uuid per class in the URL; the same Q7 rule - archived
 * classes drop out - is applied as an exclusion instead, which shrinks rather than grows
 * with the academy. See mentoringScopeClassIds for the mentor/oversight split itself.
 */
async function scopeFilter(actor: Profile): Promise<Pick<SessionPageFilter, 'classIds' | 'excludeClassIds'>> {
  if (await isMentoringOversight(actor.id)) return { excludeClassIds: await selectArchivedClassIds() }
  return { classIds: await mentoringScopeClassIds(actor) }
}

/**
 * One page of session timings across the actor's scope, newest first, with the exact total.
 *
 * EVERY ROW IS A SESSION, so there is no orphan-mark case to fold in: attendance.session_id
 * is NOT NULL (0094), bound to (class_id, session_date) (0099), and deleting a session
 * CASCADEs its marks away. A mark without a session cannot exist, so a "(class, date) with
 * attendance but nothing recorded" row would be unreachable code.
 *
 * The read is bounded. An unbounded fetch here is silently truncated at the PostgREST row
 * cap, which understates the total and makes older sessions unreachable - and marks whose
 * session fell outside the truncation would look like orphans.
 */
export async function listMenteeSessionTimings(
  actor: Profile,
  opts: { page: number; pageSize: number; filters?: SessionTimingFilters },
): Promise<Page<MenteeSessionTiming>> {
  const scope = await scopeFilter(actor)
  const { studentClassIds, ...rest } = opts.filters ?? {}
  const scopedClassIds = studentClassIds
    ? // Intersect: a mentor's scope wins over the requested student, so a student outside
      // their mentees narrows to nothing rather than widening the list.
      (scope.classIds?.filter((id) => studentClassIds.includes(id)) ?? studentClassIds)
    : scope.classIds
  const { items: sessions, total } = await selectSessionPage(
    { excludeClassIds: scope.excludeClassIds, classIds: scopedClassIds, ...rest },
    toRange(opts.page, opts.pageSize),
  )
  return { items: await enrichSessions(sessions), total }
}

/**
 * Turn raw session rows into display rows: names, class, subject, and the student's
 * recorded entry time.
 *
 * Extracted so the FLAT list and the STUDENT-GROUPED list enrich identically. The grouped
 * view reads a small page per student, then hands the union here - one set of lookups for
 * the whole screen rather than one set per group, which is what made per-group enrichment
 * worth avoiding.
 *
 * Every lookup is keyed to the rows PASSED IN, so none of them scales with the academy.
 */
async function enrichSessions(sessions: ClassSessionRow[]): Promise<MenteeSessionTiming[]> {
  if (sessions.length === 0) return []
  const pageClassIds = [...new Set(sessions.map((s) => s.class_id))]
  const [joinRows, enrollRefs, classes] = await Promise.all([
    selectJoinRowsForSessionsAsService(sessions.map((s) => s.id)),
    selectActiveEnrollmentRefsByClassIds(pageClassIds),
    selectClassesByIds(pageClassIds),
  ])

  const studentByClass = new Map(enrollRefs.map((r) => [r.class_id, r.student_id]))
  const classNameById = new Map(classes.map((c) => [c.id, c.name]))
  // Attendance is per SESSION (0094), so index the marks by session id. Keying by
  // (class, date) would keep only one mark per day and show the same entry time against
  // every session that day.
  const joinBySession = new Map(joinRows.map((r) => [r.session_id, r]))

  const subjectIds = [...new Set(sessions.map((s) => s.subject_id).filter((id): id is string => id != null))]
  const subjectNameById = new Map((await selectSubjectsByIds(subjectIds)).map((s) => [s.id, s.name]))

  // One name lookup for the page's students AND its sessions' recorded tutors.
  const personIds = new Set<string>()
  for (const r of enrollRefs) personIds.add(r.student_id)
  for (const r of joinRows) personIds.add(r.student_id)
  for (const s of sessions) if (s.tutor_id) personIds.add(s.tutor_id)
  const names = await getProfileNamesByIds([...personIds])

  const items = sessions.map((session): MenteeSessionTiming => {
    const join = joinBySession.get(session.id)
    const studentId = join?.student_id ?? studentByClass.get(session.class_id) ?? ''
    const tutorId = session.tutor_id
    return {
      sessionId: session.id,
      classId: session.class_id,
      className: classNameById.get(session.class_id) ?? 'Class',
      subject: session.subject_id ? (subjectNameById.get(session.subject_id) ?? null) : null,
      studentId,
      studentName: names.get(studentId) ?? 'Unknown',
      tutorId,
      tutorName: tutorId ? (names.get(tutorId) ?? null) : null,
      sessionDate: session.session_date,
      startAt: session.actual_start,
      studentEntryAt: join?.join_at ?? null,
      endAt: session.actual_end,
      updatedAt: session.updated_at,
    }
  })
  return items
}

/** One student's slice of the session list: their most recent matching sessions, plus how
 *  many matched in total, so the group can say what it is not showing. */
export type StudentSessionGroup = {
  studentId: string
  studentName: string
  sessions: MenteeSessionTiming[]
  /** Matching sessions for this student across ALL pages of their own history - what the
   *  "See all" link opens. `sessions` is capped; this is not. */
  total: number
}

/**
 * The session list GROUPED BY STUDENT, for a page of the student roster.
 *
 * WHY PER-STUDENT READS RATHER THAN ONE BIG ONE: the rows are capped PER GROUP, and
 * "the newest N rows for each of these students" is a per-partition limit that PostgREST
 * cannot express - there is no window function over the wire. Reading one bounded page per
 * student is the honest version: each read carries its own `.range()`, so the cap holds
 * for every student independently and a chatty student cannot starve a quiet one out of
 * their own group. The roster page bounds how many of these run (CLASSES-page sized), and
 * they run in parallel.
 *
 * The filters are applied INSIDE each group, not to a pre-sliced list: `filters` reaches
 * selectSessionPage on every per-student read, so narrowing by subject, tutor or date
 * narrows what each student shows and the per-student total alike.
 *
 * Scope is preserved exactly as the flat list applies it - a mentor's class scope is
 * INTERSECTED with the student's classes, so a student outside their mentees yields an
 * empty group rather than a widened one.
 */
export async function listSessionTimingsByStudents(
  actor: Profile,
  opts: {
    studentIds: readonly string[]
    /** Rows shown inside each group before it defers to "See all". */
    perStudent: number
    filters?: Omit<SessionTimingFilters, 'studentClassIds'>
  },
): Promise<StudentSessionGroup[]> {
  if (opts.studentIds.length === 0) return []
  const scope = await scopeFilter(actor)

  // One read for the whole roster page's enrollments, not one per student.
  const pairs = await selectActiveEnrollmentPairsByStudentIds([...opts.studentIds])
  const classesByStudent = new Map<string, string[]>()
  for (const pair of pairs) {
    const list = classesByStudent.get(pair.student_id)
    if (list) list.push(pair.class_id)
    else classesByStudent.set(pair.student_id, [pair.class_id])
  }

  const pages = await Promise.all(
    opts.studentIds.map(async (studentId) => {
      const own = classesByStudent.get(studentId) ?? []
      // Intersect with a mentor's scope; an oversight reader has no classIds and is
      // narrowed by excludeClassIds instead, exactly as the flat list does it.
      const classIds = scope.classIds ? own.filter((id) => scope.classIds?.includes(id)) : own
      if (classIds.length === 0) return { studentId, rows: [] as ClassSessionRow[], total: 0 }
      const { items, total } = await selectSessionPage(
        { excludeClassIds: scope.excludeClassIds, classIds, ...(opts.filters ?? {}) },
        toRange(1, opts.perStudent),
      )
      return { studentId, rows: items, total }
    }),
  )

  // ONE enrichment pass over every group's rows together.
  const enriched = await enrichSessions(pages.flatMap((p) => p.rows))
  const bySession = new Map(enriched.map((row) => [row.sessionId, row]))
  const names = await getProfileNamesByIds([...opts.studentIds])

  return pages.map((p) => ({
    studentId: p.studentId,
    studentName: names.get(p.studentId) ?? 'Unknown',
    sessions: p.rows.map((r) => bySession.get(r.id)).filter((r): r is MenteeSessionTiming => r != null),
    total: p.total,
  }))
}

export type UpdateStudentJoinInput = {
  classId: string
  sessionDate: string
  joinAt: string | null
  /** The session whose mark is being edited. A mark belongs to a session (0094), so this
   *  names the ROW to update as well as the window to validate against. Optional: a caller
   *  that does not identify one falls back to the day's first session. */
  sessionId?: string | null
}

/** The outer bounds of a day's sessions: earliest recorded start, latest recorded end.
 *  Null when nothing is recorded, which skips the window guard exactly as before. */
function dayWindowOf(sessions: ClassSessionRow[]): { actual_start: string | null; actual_end: string | null } | null {
  if (sessions.length === 0) return null
  const starts = sessions.map((s) => s.actual_start).filter((v): v is string => v != null)
  const ends = sessions.map((s) => s.actual_end).filter((v): v is string => v != null)
  return {
    actual_start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
    actual_end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
  }
}

/** Narrow edit: set ONLY the student joined time on an EXISTING attendance row.
 *  Reuses canManageClass; never touches status, leave, or tutor times. Validates
 *  the instant and keeps it at/-before the recorded class end. */
export async function updateStudentJoinTime(actor: Profile, input: UpdateStudentJoinInput): Promise<void> {
  if (!(await canManageClass(actor, input.classId))) {
    throw new PermissionError('You are not allowed to edit this session.')
  }
  const student = (await selectActiveEnrollmentRefsByClassIds([input.classId]))[0]?.student_id
  if (!student) throw new NotFoundError('This class has no active student.')

  // The entry time belongs to ONE session's mark (attendance is per session since 0094).
  // The list always names the session; fall back to the day's first for any caller that
  // does not, which preserves the old day-level behaviour on a single-session day.
  const daySessions = await selectSessionsForDate(input.classId, input.sessionDate)
  const markSessionId = input.sessionId ?? daySessions[0]?.id
  if (!markSessionId) {
    throw new NotFoundError('No session recorded for this date yet - record the session first.')
  }

  let joinAt: string | null = null
  if (input.joinAt) {
    const parsed = new Date(input.joinAt)
    if (Number.isNaN(parsed.getTime())) throw new ValidationError('Enter a valid joined time.')
    joinAt = parsed.toISOString()
    // Which window must the entry fall inside? The named session when the caller gives
    // one. Without a name the session is unknown, so the guard widens to the DAY's overall
    // window (earliest start -> latest end) - loose enough to admit an entry belonging to
    // any of that day's sessions, still tight enough to reject a time from elsewhere.
    const session = input.sessionId
      ? (daySessions.find((x) => x.id === input.sessionId) ?? null)
      : dayWindowOf(daySessions)
    // Data integrity: a student cannot join after the class has ended.
    if (session?.actual_end && parsed.getTime() > new Date(session.actual_end).getTime()) {
      throw new ValidationError('Student joined time cannot be after the class end time.')
    }
    // ...nor implausibly before it began. Joining a little EARLY is normal (a student
    // waiting in the room before the tutor starts), so this is a grace window rather than
    // a hard "at or after start": it accepts the early joiner while rejecting a time that
    // belongs to a different part of the day - the shape of the bad rows found in
    // practice (a 02:45 entry recorded against a 13:31-17:40 session).
    if (session?.actual_start) {
      const earliest = new Date(session.actual_start).getTime() - EARLY_JOIN_GRACE_MINUTES * 60_000
      if (parsed.getTime() < earliest) {
        throw new ValidationError(
          `Student joined time cannot be more than ${EARLY_JOIN_GRACE_MINUTES} minutes before the session start.`,
        )
      }
    }
  }

  const updated = await updateJoinAtAsService(markSessionId, student, joinAt)
  if (!updated) {
    throw new NotFoundError('No attendance record exists for this session yet - mark attendance first.')
  }
  // The SESSION whose mark changed. A (class, date) key cannot distinguish two edits on
  // a two-session day, which is exactly what the log is asked afterwards.
  await auditPrivilegedAction(actor, 'attendance.student_join', 'class_session', markSessionId)
}

export type UpdateSessionTimesInput = {
  sessionId: string
  startAt: string | null
  endAt: string | null
  /** The `updated_at` the editor loaded, for the optimistic lock (rejects a save when the row
   *  changed underneath). Optional - omit to skip the concurrency guard. */
  expectedUpdatedAt?: string | null
}

/** An ISO instant or null, canonicalized; throws on a malformed value. */
function normalizeInstant(value: string | null, field: 'start' | 'end'): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`Enter a valid ${field} time.`)
  return parsed.toISOString()
}

/**
 * Narrow edit: set ONLY a session's actual window (start + end) on an EXISTING session row.
 * Reuses canManageClass (a mentor of this class's mentee passes it); never touches tutor
 * attribution, summary or the staff note. Reads the current row first for the tutor (overlap
 * check), the before-values (audit diff) and updated_at (optimistic lock). Enforces the shared
 * window rule (end-after-start incl. cross-midnight roll, no end-without-start, <=24h), rejects
 * a tutor double-booking, and records the before/after in the audit trail.
 */
export async function updateSessionTimes(actor: Profile, input: UpdateSessionTimesInput): Promise<void> {
  // Load first, then authorize on the session's OWN class - resolved from the row rather
  // than taken from the caller, so an id from a class the editor may not manage is refused.
  const existing = await selectSessionByIdAsService(input.sessionId)
  if (!existing) {
    throw new NotFoundError('That session no longer exists.')
  }
  if (!(await canManageClass(actor, existing.class_id))) {
    throw new PermissionError('You are not allowed to edit this session.')
  }
  // Sibling guards the record-session form already applies: a valid date, and no
  // rewriting the hours of an ARCHIVED class.
  if (!isCalendarDate(existing.session_date)) {
    throw new ValidationError('Invalid session date.')
  }
  await assertClassActive(existing.class_id)

  const { start, end } = resolveSessionWindow(
    normalizeInstant(input.startAt, 'start'),
    normalizeInstant(input.endAt, 'end'),
  )
  await assertNoTutorOverlap(existing.tutor_id, start, end, existing.id)

  const saved = await updateSessionActualTimesAsService(
    existing.id,
    start,
    end,
    input.expectedUpdatedAt ?? existing.updated_at,
  )
  if (!saved) {
    throw new ValidationError('This session was changed by someone else - reload the page and try again.')
  }
  await auditPrivilegedAction(actor, 'attendance.session_times', 'class_session', existing.id, {
    before: { actual_start: existing.actual_start, actual_end: existing.actual_end },
    after: { actual_start: start, actual_end: end },
  })
}
