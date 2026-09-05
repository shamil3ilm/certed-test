import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { mentorAuthorityClassIds, canManageClass } from '@/lib/permission/class'
import { assertClassActive } from '@/lib/permission'
import { isCalendarDate } from '@/lib/time/format'
import { selectActiveClassIds, selectActiveClassIdsAmong, selectClassesByIds } from '@/lib/data/classes'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { selectActiveEnrollmentRefsByClassIds } from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import {
  selectSessionsForDate,
  selectSessionByIdAsService,
  type ClassSessionRow,
  selectSessionsForClassesAsService,
  updateSessionActualTimesAsService,
} from '@/lib/data/class-sessions'
import { selectJoinRowsForClassesAsService, updateJoinAtAsService } from '@/lib/data/attendance'
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
  /** The recorded session's own id, or null for a day that has attendance but no recorded
   *  session yet. Rows are now per SESSION - a class may hold several on one date - so this
   *  is what an edit targets. */
  sessionId: string | null
  classId: string
  className: string
  /** The class's CURRENT subject. Subject is not historized per session (it lives on
   *  the class, not class_sessions), so this reflects the class's subject today - fine
   *  for a 1:1 (student, subject, tutor) class where the subject is effectively fixed. */
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

const rowKey = (classId: string, sessionDate: string) => `${classId}|${sessionDate}`

/** How far BEFORE the recorded session start a student entry may legitimately fall - a
 *  student waiting in the room before the tutor starts is normal, so the entry time is
 *  bounded by a grace window rather than pinned at/after the start. */
const EARLY_JOIN_GRACE_MINUTES = 60

/** Classes whose session timings the actor may review: their mentees' classes
 *  (a mentor), or every class for an oversight admin - mirroring the mentee list. */
async function timingClassIds(actor: Profile): Promise<string[]> {
  const flags = await loadPersonaFlags(actor.id)
  // Archived classes drop out of the operational session-timing view (Q7).
  if (flags.isAdmin) return selectActiveClassIds()
  return selectActiveClassIdsAmong([...(await mentorAuthorityClassIds(actor.id))])
}

/** Session timings across the actor's mentee classes: one row per (class, date),
 *  unioning class_sessions (tutor joined / class end) with attendance (student
 *  joined), newest session first. */
export async function listMenteeSessionTimings(actor: Profile): Promise<MenteeSessionTiming[]> {
  const classIds = await timingClassIds(actor)
  if (classIds.length === 0) return []

  const [sessions, joinRows, enrollRefs, classes] = await Promise.all([
    selectSessionsForClassesAsService(classIds),
    selectJoinRowsForClassesAsService(classIds),
    selectActiveEnrollmentRefsByClassIds(classIds),
    selectClassesByIds(classIds),
  ])

  const studentByClass = new Map(enrollRefs.map((r) => [r.class_id, r.student_id]))
  const classNameById = new Map(classes.map((c) => [c.id, c.name]))
  const subjectIdByClass = new Map(classes.map((c) => [c.id, c.subject_id]))
  // Attendance is per SESSION (0094), so index the marks by session id. Keying by
  // (class, date) would keep only one mark per day and show the same entry time against
  // every session that day.
  const joinBySession = new Map(joinRows.map((r) => [r.session_id, r]))

  // Subject names for the classes in scope (the class's current subject; see the type).
  const subjectIds = [...new Set(classes.map((c) => c.subject_id).filter((id): id is string => id != null))]
  const subjectNameById = new Map((await selectSubjectsByIds(subjectIds)).map((s) => [s.id, s.name]))

  // One name lookup for students AND the sessions' recorded tutors.
  const personIds = new Set<string>()
  for (const r of enrollRefs) personIds.add(r.student_id)
  for (const r of joinRows) personIds.add(r.student_id)
  for (const s of sessions) if (s.tutor_id) personIds.add(s.tutor_id)
  const names = await getProfileNamesByIds([...personIds])

  /** Build one output row. `session` is null for a day that has attendance but no recorded
   *  session yet - still listed, so a marked-but-unrecorded day stays visible. */
  const toRow = (classId: string, sessionDate: string, session: ClassSessionRow | null): MenteeSessionTiming => {
    const join = session ? joinBySession.get(session.id) : undefined
    const studentId = join?.student_id ?? studentByClass.get(classId) ?? ''
    const subjectId = subjectIdByClass.get(classId) ?? null
    const tutorId = session?.tutor_id ?? null
    return {
      sessionId: session?.id ?? null,
      classId,
      className: classNameById.get(classId) ?? 'Class',
      subject: subjectId ? (subjectNameById.get(subjectId) ?? null) : null,
      studentId,
      studentName: names.get(studentId) ?? 'Unknown',
      tutorId,
      tutorName: tutorId ? (names.get(tutorId) ?? null) : null,
      sessionDate,
      startAt: session?.actual_start ?? null,
      // Attendance is per (class, student, DATE), so every session that day shares the
      // student's one recorded entry time.
      studentEntryAt: join?.join_at ?? null,
      endAt: session?.actual_end ?? null,
      updatedAt: session?.updated_at ?? null,
    }
  }

  // ONE ROW PER RECORDED SESSION - a class may hold several on the same date, and each is
  // its own record. (This used to collapse to one row per (class, date), which hid every
  // session but the last.) Days with attendance but no recorded session are added after,
  // so a marked-but-unrecorded day is still listed exactly once.
  const rows: MenteeSessionTiming[] = sessions.map((session) => toRow(session.class_id, session.session_date, session))
  const datesWithSession = new Set(sessions.map((s) => rowKey(s.class_id, s.session_date)))
  for (const r of joinRows) {
    if (datesWithSession.has(rowKey(r.class_id, r.session_date))) continue
    rows.push(toRow(r.class_id, r.session_date, null))
  }
  rows.sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0))
  return rows
}

export type UpdateStudentJoinInput = {
  classId: string
  sessionDate: string
  joinAt: string | null
  /** The session whose window bounds the join time. Attendance stays per (class, student,
   *  date), so this only selects WHICH session's window to validate against. */
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
    // Which window must the entry fall inside? A named session when the caller gives one,
    // otherwise the DAY's overall window (earliest start -> latest end) across that class's
    // sessions - attendance is per day, so with several sessions the guard has to admit an
    // entry belonging to any of them while still rejecting a time from elsewhere in the day.
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
  await auditPrivilegedAction(actor, 'attendance.student_join', 'attendance', rowKey(input.classId, input.sessionDate))
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
