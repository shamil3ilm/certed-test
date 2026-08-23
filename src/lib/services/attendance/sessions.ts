import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { isCalendarDate } from '@/lib/time/format'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError, NotFoundError } from '@/lib/errors'
import {
  selectRecentSessions,
  selectSession,
  selectSessionAsService,
  upsertSession,
  writeStudentSessionFeedback,
  type ClassSessionRow,
} from '@/lib/data/class-sessions'
import {
  selectActiveClassIdsForStudent,
  selectActiveEnrollmentRefsByClassIds,
  selectActiveTutorRowsForClass,
} from '@/lib/data/class-membership'
import { studentHasAttendance, updateJoinAtAsService } from '@/lib/data/attendance'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { validateUuidField } from '@/lib/validation/id'
import { assertClassTutor } from '@/lib/services/class-tutor-validation'
import { z } from 'zod'

/** A free-text session note: trimmed, bounded, empty -> null (clears it). */
const noteField = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => v || null)

/** Recording a class session's timing (scheduled + actual window, tutor
 *  join/leave). canManageClass-gated + audited, like marking. */

export type ClassSession = ClassSessionRow

/** An ISO instant or empty -> null. The client converts its local time inputs to
 *  ISO before submitting (a bare time has no timezone). */
const isoOrNull = z
  .union([z.string().datetime(), z.literal('')])
  .nullable()
  .transform((v) => v || null)

// The session records just three times now: start + end (the actual window) and the
// student's entry. Start/end live on class_sessions; student entry is the enrolled
// student's attendance join, kept as the single source so the mentor "Session times"
// page and this form never diverge. scheduled/tutor columns are no longer collected.
const sessionTimesSchema = z.object({
  actual_start: isoOrNull,
  actual_end: isoOrNull,
})

export type SaveSessionActionInput = {
  classId?: FormDataEntryValue | null
  sessionDate?: FormDataEntryValue | null
  tutor_id?: FormDataEntryValue | null
  actual_start?: FormDataEntryValue | null
  actual_end?: FormDataEntryValue | null
  /** The enrolled student's entry time (their attendance join). Empty clears it. */
  student_entry?: FormDataEntryValue | null
  summary?: FormDataEntryValue | null
  /** A staff-private note, not shared with the student. */
  staff_note?: FormDataEntryValue | null
}

/** The tutor to attribute a session to when none is specified: the recorder if they
 *  teach the class, otherwise the class's assigned tutor (a mentor/admin recording is
 *  not the tutor). null when the class has no assigned tutor. */
async function defaultSessionTutor(actorId: string, classId: string): Promise<string | null> {
  const tutorIds = (await selectActiveTutorRowsForClass(classId)).map((t) => t.tutor_id)
  if (tutorIds.includes(actorId)) return actorId
  return tutorIds[0] ?? null
}

export async function saveSessionTimes(actor: Profile, input: SaveSessionActionInput): Promise<ClassSession> {
  const classId = String(input.classId ?? '')
  const sessionDate = String(input.sessionDate ?? '')
  if (!(await canManageClass(actor, classId))) {
    throw new PermissionError('Not allowed to record this session.')
  }
  if (!isCalendarDate(sessionDate)) {
    throw new ValidationError('Invalid session date.')
  }
  const parsed = sessionTimesSchema.safeParse({
    actual_start: String(input.actual_start ?? ''),
    actual_end: String(input.actual_end ?? ''),
  })
  if (!parsed.success) {
    throw new ValidationError('Invalid session times.')
  }

  // Resolve + fully validate the student entry BEFORE any write, so a bad entry never
  // leaves a half-saved session. Empty clears it. Entry is the enrolled student's
  // attendance join, so it needs an existing attendance row (mark attendance first).
  const studentEntryRaw = String(input.student_entry ?? '').trim()
  let studentEntry: { studentId: string; joinAt: string } | null = null
  if (studentEntryRaw) {
    const entryDate = new Date(studentEntryRaw)
    if (Number.isNaN(entryDate.getTime())) {
      throw new ValidationError('Enter a valid student entry time.')
    }
    if (parsed.data.actual_end && entryDate.getTime() > Date.parse(parsed.data.actual_end)) {
      throw new ValidationError('Student entry cannot be after the session end time.')
    }
    const student = (await selectActiveEnrollmentRefsByClassIds([classId]))[0]?.student_id
    if (!student) throw new NotFoundError('This class has no active student.')
    if (!(await studentHasAttendance(classId, student, sessionDate))) {
      throw new ValidationError('Mark attendance for this student first, then set their entry time.')
    }
    studentEntry = { studentId: student, joinAt: entryDate.toISOString() }
  }

  // The tutor attributed to a session must be a real tutor of this class. An EXPLICIT
  // id is admin-only unless it's the recorder's own, and is validated + confirmed
  // assigned to the class either way (so a mentor who passes their own id is rejected,
  // not silently mislabelled). With NO explicit id, default to the class's assigned
  // tutor - the recorder only if they teach it - so a mentor/admin recording is never
  // written as the tutor.
  const explicitTutorId = String(input.tutor_id ?? '').trim()
  let tutorId: string | null
  if (explicitTutorId) {
    if (explicitTutorId !== actor.id) {
      const { isAdmin } = await loadPersonaFlags(actor.id)
      if (!isAdmin) throw new PermissionError('Only an admin may record a session for another tutor.')
    }
    validateUuidField(explicitTutorId, 'Invalid tutor id.')
    await assertClassTutor(explicitTutorId, classId)
    tutorId = explicitTutorId
  } else {
    tutorId = await defaultSessionTutor(actor.id, classId)
  }

  const saved = await upsertSession({
    class_id: classId,
    session_date: sessionDate,
    tutor_id: tutorId,
    actual_start: parsed.data.actual_start,
    actual_end: parsed.data.actual_end,
    summary: noteField.parse(String(input.summary ?? '')),
    staff_note: noteField.parse(String(input.staff_note ?? '')),
  })
  // Entry was fully validated above (an attendance row exists), so this update lands.
  if (studentEntry) {
    await updateJoinAtAsService(classId, studentEntry.studentId, sessionDate, studentEntry.joinAt)
  }
  await auditPrivilegedAction(actor, 'attendance.session', 'class', classId)
  return saved
}

export type SaveFeedbackActionInput = {
  classId?: FormDataEntryValue | null
  sessionDate?: FormDataEntryValue | null
  feedback?: FormDataEntryValue | null
}

/**
 * A student leaves feedback on one of their own class sessions. Gated on the
 * actor being the class's enrolled student (staff use the summary field instead),
 * then written to that session's row - creating it if the tutor hasn't recorded
 * times yet.
 */
export async function saveSessionFeedback(actor: Profile, input: SaveFeedbackActionInput): Promise<void> {
  const classId = String(input.classId ?? '')
  const sessionDate = String(input.sessionDate ?? '')
  if (!isCalendarDate(sessionDate)) {
    throw new ValidationError('Invalid session date.')
  }
  const enrolledClassIds = await selectActiveClassIdsForStudent(actor.id)
  if (!enrolledClassIds.includes(classId)) {
    throw new PermissionError('Only the enrolled student can leave feedback for this class.')
  }
  // Feedback is per REAL session: the student must have an attendance record for this
  // date (that is the only place the feedback field is surfaced). Without this, a
  // crafted POST could create class_sessions rows for arbitrary dates via the upsert.
  if (!(await studentHasAttendance(classId, actor.id, sessionDate))) {
    throw new ValidationError('You can leave feedback only for a session you attended.')
  }
  await writeStudentSessionFeedback(classId, sessionDate, noteField.parse(String(input.feedback ?? '')))
  await auditPrivilegedAction(actor, 'attendance.feedback', 'class', classId)
}

export async function getSession(classId: string, date: string): Promise<ClassSession | null> {
  return selectSession(classId, date)
}

/** The session INCLUDING the staff-private note, for a manager's own view/form. The
 *  caller must already have proved manage rights on the class (the attendance
 *  page-data does, in its canManageClass branch). Service-role, because staff_note is
 *  withheld from the authenticated SELECT grant (0070). */
export async function getManagerSession(classId: string, date: string): Promise<ClassSession | null> {
  return selectSessionAsService(classId, date)
}

export async function listRecentSessions(classId: string, limit?: number): Promise<ClassSession[]> {
  return selectRecentSessions(classId, limit)
}
