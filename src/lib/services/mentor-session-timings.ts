import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { mentorAuthorityClassIds, canManageClass } from '@/lib/permission/class'
import { selectAllClassIds, selectClassesByIds } from '@/lib/data/classes'
import { selectActiveEnrollmentRefsByClassIds } from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import { selectSession, selectSessionsForClassesAsService } from '@/lib/data/class-sessions'
import { selectJoinRowsForClassesAsService, updateJoinAtAsService } from '@/lib/data/attendance'
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
  studentId: string
  studentName: string
  sessionDate: string
  startAt: string | null
  studentEntryAt: string | null
  endAt: string | null
}

const rowKey = (classId: string, sessionDate: string) => `${classId}|${sessionDate}`

/** Classes whose session timings the actor may review: their mentees' classes
 *  (a mentor), or every class for an oversight admin - mirroring the mentee list. */
async function timingClassIds(actor: Profile): Promise<string[]> {
  const flags = await loadPersonaFlags(actor.id)
  if (flags.isAdmin) return selectAllClassIds()
  return [...(await mentorAuthorityClassIds(actor.id))]
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
  const joinByKey = new Map(joinRows.map((r) => [rowKey(r.class_id, r.session_date), r]))
  const sessionByKey = new Map(sessions.map((s) => [rowKey(s.class_id, s.session_date), s]))

  // Union of (class, date) keys from both tables so a session recorded in only one
  // of them (tutor times but no marking, or vice-versa) is still listed.
  const keys = new Map<string, { classId: string; sessionDate: string }>()
  for (const s of sessions)
    keys.set(rowKey(s.class_id, s.session_date), { classId: s.class_id, sessionDate: s.session_date })
  for (const r of joinRows)
    keys.set(rowKey(r.class_id, r.session_date), { classId: r.class_id, sessionDate: r.session_date })

  const studentIds = new Set<string>()
  for (const r of enrollRefs) studentIds.add(r.student_id)
  for (const r of joinRows) studentIds.add(r.student_id)
  const names = await getProfileNamesByIds([...studentIds])

  const rows: MenteeSessionTiming[] = []
  for (const { classId, sessionDate } of keys.values()) {
    const k = rowKey(classId, sessionDate)
    const session = sessionByKey.get(k)
    const join = joinByKey.get(k)
    const studentId = join?.student_id ?? studentByClass.get(classId) ?? ''
    rows.push({
      classId,
      className: classNameById.get(classId) ?? 'Class',
      studentId,
      studentName: names.get(studentId) ?? 'Unknown',
      sessionDate,
      startAt: session?.actual_start ?? null,
      studentEntryAt: join?.join_at ?? null,
      endAt: session?.actual_end ?? null,
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
