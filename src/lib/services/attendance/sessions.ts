import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { canWriteClass } from '@/lib/permission/class-write'
import { isCalendarDate } from '@/lib/time/format'
import { resolveSessionWindow } from '@/lib/attendance/session-window'
import { assertNoTutorOverlap } from '@/lib/services/attendance/session-overlap'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { NotFoundError, PermissionError, ValidationError } from '@/lib/errors'
import {
  deleteSessionById,
  insertSession,
  selectRecentSessions,
  selectSessionByIdAsService,
  selectSessionsForDate,
  selectSessionsForDateAsService,
  updateSessionById,
  writeStudentSessionFeedback,
  type ClassSessionRow,
} from '@/lib/data/class-sessions'
import { selectActiveClassIdsForStudent, selectActiveTutorRowsForClass } from '@/lib/data/class-membership'
import { studentHasAttendance } from '@/lib/data/attendance'
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
  /** The session being EDITED. Absent/empty records a NEW session, so a class can hold
   *  several sessions on the same date (0093) instead of each save replacing the last. */
  sessionId?: FormDataEntryValue | null
  tutor_id?: FormDataEntryValue | null
  actual_start?: FormDataEntryValue | null
  actual_end?: FormDataEntryValue | null
  summary?: FormDataEntryValue | null
  /** A staff-private note, not shared with the student. Only written when
   *  `canEditStaffNote` is true (a manageClassContent holder). */
  staff_note?: FormDataEntryValue | null
  /** Whether the caller may write the staff-private note (manageClassContent). The
   *  action resolves this from the actor's capabilities; a mentor editing the
   *  times/summary passes false, so staff_note is left untouched. */
  canEditStaffNote?: boolean
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
  // Resolve + validate the window: roll a cross-midnight end to the next day, then reject an
  // impossible window (end before/at start, end with no start) or an absurd duration. Session
  // times feed teaching-hour totals and the DB does not constrain this, so guard it here.
  const window = resolveSessionWindow(parsed.data.actual_start, parsed.data.actual_end)

  // Student entry (the student's attendance join) is a ROSTER fact, set on the mark-
  // attendance form (manageAttendance - mentors too), not here on the session record.
  // Keeping it in one place avoids two entry points and two capability gates for the
  // same datum.

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

  // Editing an existing session, or recording a new one? An id identifies the row now that
  // (class, date) no longer does. Load it first so we can (a) confirm it really belongs to
  // this class - an id from another class must not be editable through this class's form -
  // and (b) record what changed in the audit.
  const rawSessionId = String(input.sessionId ?? '').trim()
  let before: ClassSession | null = null
  if (rawSessionId) {
    validateUuidField(rawSessionId, 'Invalid session id.')
    before = await selectSessionByIdAsService(rawSessionId)
    if (!before) throw new NotFoundError('That session no longer exists.')
    if (before.class_id !== classId) throw new PermissionError('That session belongs to another class.')
  }

  // A tutor cannot teach two classes at once - reject a window that overlaps another of this
  // tutor's sessions. An edit excludes ITSELF by id; a new session excludes nothing.
  await assertNoTutorOverlap(tutorId, window.start, window.end, before?.id ?? null)

  // Times + summary are editable by any manageAttendance holder (mentors included, via
  // the action). The staff-PRIVATE note is a higher bar - only a manageClassContent
  // holder (tutor / admin) may set it (the action resolves canEditStaffNote). When the
  // caller lacks it, staff_note is OMITTED from the write entirely, so an existing note
  // is PRESERVED (not cleared) and a mentor can never write it.
  const canEditStaffNote = input.canEditStaffNote ?? false
  const fields = {
    tutor_id: tutorId,
    actual_start: window.start,
    actual_end: window.end,
    // WHO entered the hours, which is not the same fact as who is paid for them (tutor_id).
    // Pay is summed from this window, so without it a tutor's self-recorded month and an
    // admin-recorded one are indistinguishable in the data and no reviewer can tell them
    // apart (C-06). Recorded on every write, so it always reflects the LAST attestation.
    hours_recorded_by: actor.id,
    summary: noteField.parse(String(input.summary ?? '')),
    ...(canEditStaffNote ? { staff_note: noteField.parse(String(input.staff_note ?? '')) } : {}),
  }
  const saved = before
    ? await updateSessionById(before.id, fields)
    : await insertSession({ class_id: classId, session_date: sessionDate, ...fields })

  await auditPrivilegedAction(actor, 'attendance.session', 'class', classId, {
    session_id: saved.id,
    session_date: sessionDate,
    before: before ? { actual_start: before.actual_start, actual_end: before.actual_end } : null,
    after: { actual_start: window.start, actual_end: window.end },
  })
  return saved
}

/**
 * Remove a recorded session. Gated on canWriteClass (the TUTOR-only scope - recording a
 * session uses the wider canManageClass, which admits a mentor; removing one does not),
 * resolved from the row rather than trusted from the caller, and audited with the window
 * that was removed so a monthly total that drops can be explained.
 */
export async function deleteSessionTimes(actor: Profile, sessionId: string): Promise<void> {
  validateUuidField(sessionId, 'Invalid session id.')
  const session = await selectSessionByIdAsService(sessionId)
  if (!session) throw new NotFoundError('That session no longer exists.')
  // canWriteClass, not canManageClass: the latter admits a MENTOR (pastoral oversight),
  // but this is a staff WRITE and the table's RLS excludes mentors for this verb. The
  // write goes through the service-role client, so RLS never runs and this gate is the
  // only control - a mismatch here is the whole exposure, not a second line of defence (C-08).
  if (!(await canWriteClass(actor, session.class_id))) {
    throw new PermissionError('Not allowed to remove this session.')
  }
  await deleteSessionById(sessionId)
  await auditPrivilegedAction(actor, 'attendance.session.delete', 'class', session.class_id, {
    session_id: sessionId,
    session_date: session.session_date,
    removed: { actual_start: session.actual_start, actual_end: session.actual_end },
  })
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
 *
 * student_feedback is a single column on the session, not keyed per student. That is
 * safe because a class has exactly ONE active student (enforced by
 * enrollments_one_active_student_per_class), so the session's feedback IS that student's.
 * If multi-student classes are ever introduced, this must move to a per-(session, student)
 * table before feedback can be attributed or isolated per student.
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

/** Every session recorded for a class on one date (a class may hold several). */
export async function listSessionsForDate(classId: string, date: string): Promise<ClassSession[]> {
  return selectSessionsForDate(classId, date)
}

/** The session INCLUDING the staff-private note, for a manager's own view/form.
 *  Self-gates the service-role read on canManageClass (staff_note is withheld from
 *  the authenticated SELECT grant, 0070, so this reads it via the service role) -
 *  mirroring listGuardians, so safety no longer rests on the caller proving remit. */
export async function listManagerSessionsForDate(
  actor: Profile,
  classId: string,
  date: string,
): Promise<ClassSession[]> {
  if (!(await canManageClass(actor, classId))) {
    throw new PermissionError('Not allowed to view this session.')
  }
  return selectSessionsForDateAsService(classId, date)
}

export async function listRecentSessions(classId: string, limit?: number): Promise<ClassSession[]> {
  return selectRecentSessions(classId, limit)
}
