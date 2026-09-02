import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { mentorAuthorityClassIds, canManageClass } from '@/lib/permission/class'
import { selectActiveClassIds, selectActiveClassIdsAmong, selectClassesByIds } from '@/lib/data/classes'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { selectActiveEnrollmentRefsByClassIds } from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import {
  selectSession,
  selectSessionAsService,
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
  const joinByKey = new Map(joinRows.map((r) => [rowKey(r.class_id, r.session_date), r]))
  const sessionByKey = new Map(sessions.map((s) => [rowKey(s.class_id, s.session_date), s]))

  // Subject names for the classes in scope (the class's current subject; see the type).
  const subjectIds = [...new Set(classes.map((c) => c.subject_id).filter((id): id is string => id != null))]
  const subjectNameById = new Map((await selectSubjectsByIds(subjectIds)).map((s) => [s.id, s.name]))

  // Union of (class, date) keys from both tables so a session recorded in only one
  // of them (tutor times but no marking, or vice-versa) is still listed.
  const keys = new Map<string, { classId: string; sessionDate: string }>()
  for (const s of sessions)
    keys.set(rowKey(s.class_id, s.session_date), { classId: s.class_id, sessionDate: s.session_date })
  for (const r of joinRows)
    keys.set(rowKey(r.class_id, r.session_date), { classId: r.class_id, sessionDate: r.session_date })

  // One name lookup for students AND the sessions' recorded tutors.
  const personIds = new Set<string>()
  for (const r of enrollRefs) personIds.add(r.student_id)
  for (const r of joinRows) personIds.add(r.student_id)
  for (const s of sessions) if (s.tutor_id) personIds.add(s.tutor_id)
  const names = await getProfileNamesByIds([...personIds])

  const rows: MenteeSessionTiming[] = []
  for (const { classId, sessionDate } of keys.values()) {
    const k = rowKey(classId, sessionDate)
    const session = sessionByKey.get(k)
    const join = joinByKey.get(k)
    const studentId = join?.student_id ?? studentByClass.get(classId) ?? ''
    const subjectId = subjectIdByClass.get(classId) ?? null
    const tutorId = session?.tutor_id ?? null
    rows.push({
      classId,
      className: classNameById.get(classId) ?? 'Class',
      subject: subjectId ? (subjectNameById.get(subjectId) ?? null) : null,
      studentId,
      studentName: names.get(studentId) ?? 'Unknown',
      tutorId,
      tutorName: tutorId ? (names.get(tutorId) ?? null) : null,
      sessionDate,
      startAt: session?.actual_start ?? null,
      studentEntryAt: join?.join_at ?? null,
      endAt: session?.actual_end ?? null,
      updatedAt: session?.updated_at ?? null,
    })
  }
  rows.sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0))
  return rows
}

export type UpdateStudentJoinInput = { classId: string; sessionDate: string; joinAt: string | null }

/** Narrow edit: set ONLY the student joined time on an EXISTING attendance row.
 *  Reuses canManageClass; never touches status, leave, or tutor times. Validates
 *  the instant and keeps it at/-before the recorded class end. */
export async function updateStudentJoinTime(actor: Profile, input: UpdateStudentJoinInput): Promise<void> {
  if (!(await canManageClass(actor, input.classId))) {
    throw new PermissionError('You are not allowed to edit this session.')
  }
  const student = (await selectActiveEnrollmentRefsByClassIds([input.classId]))[0]?.student_id
  if (!student) throw new NotFoundError('This class has no active student.')

  let joinAt: string | null = null
  if (input.joinAt) {
    const parsed = new Date(input.joinAt)
    if (Number.isNaN(parsed.getTime())) throw new ValidationError('Enter a valid joined time.')
    joinAt = parsed.toISOString()
    // Data integrity: a student cannot join after the class has ended.
    const session = await selectSession(input.classId, input.sessionDate)
    if (session?.actual_end && parsed.getTime() > new Date(session.actual_end).getTime()) {
      throw new ValidationError('Student joined time cannot be after the class end time.')
    }
  }

  const updated = await updateJoinAtAsService(input.classId, student, input.sessionDate, joinAt)
  if (!updated) {
    throw new NotFoundError('No attendance record exists for this session yet - mark attendance first.')
  }
  await auditPrivilegedAction(actor, 'attendance.student_join', 'attendance', rowKey(input.classId, input.sessionDate))
}

export type UpdateSessionTimesInput = {
  classId: string
  sessionDate: string
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
  if (!(await canManageClass(actor, input.classId))) {
    throw new PermissionError('You are not allowed to edit this session.')
  }
  const existing = await selectSessionAsService(input.classId, input.sessionDate)
  if (!existing) {
    throw new NotFoundError('No session recorded for this date yet - record the session first.')
  }

  const { start, end } = resolveSessionWindow(
    normalizeInstant(input.startAt, 'start'),
    normalizeInstant(input.endAt, 'end'),
  )
  await assertNoTutorOverlap(existing.tutor_id, start, end, input.classId, input.sessionDate)

  const saved = await updateSessionActualTimesAsService(
    input.classId,
    input.sessionDate,
    start,
    end,
    input.expectedUpdatedAt ?? existing.updated_at,
  )
  if (!saved) {
    throw new ValidationError('This session was changed by someone else - reload the page and try again.')
  }
  await auditPrivilegedAction(
    actor,
    'attendance.session_times',
    'class_session',
    rowKey(input.classId, input.sessionDate),
    {
      before: { actual_start: existing.actual_start, actual_end: existing.actual_end },
      after: { actual_start: start, actual_end: end },
    },
  )
}
