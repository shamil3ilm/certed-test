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
  selectSessionsByIds,
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
import { getProfileById } from '@/lib/services/users'
import { notifyBestEffort, notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { isSessionKind, kindOf, type SessionKind } from '@/lib/attendance/session-kind'
import { hoursNotices } from '@/lib/attendance/hours-notice'
import { sessionWorker } from '@/lib/attendance/hours-breakdown'
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
  /** regular | demo | exam (0123). Absent keeps an edited session's kind and records a new one
   *  as regular, so a caller that never heard of kinds cannot reclassify anything. */
  kind?: FormDataEntryValue | null
  /** Who monitored an exam when it was not the tutor. Only meaningful for kind 'exam': '' means
   *  the tutor monitored it, and absent (null) leaves an edited exam's monitor as it was. */
  monitor_id?: FormDataEntryValue | null
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

/** Roles that may monitor an exam: the staff who sit in a room with a candidate. */
const MONITOR_ROLES: ReadonlyArray<Profile['role']> = ['tutor', 'mentor', 'sub_admin', 'admin']

/**
 * Resolve who an exam is credited to, as a profile id - or null when the tutor monitored it.
 *
 * Naming ANYONE other than the session's own tutor moves exam hours onto that person's working
 * time, which is the same consequence as attributing a session to another tutor, so it carries
 * the same gate: an academy-authority act (admin / sub_admin). That includes naming yourself: a
 * mentor overseeing a mentee class is not its tutor, and recording a session must not let them
 * credit exam hours to themselves. Leaving it blank, or naming the tutor, needs nothing extra.
 * Exported for unit tests.
 */
export async function resolveExamMonitor(
  actor: Profile,
  requested: string,
  tutorId: string | null,
): Promise<string | null> {
  if (!requested || requested === tutorId) return null
  validateUuidField(requested, 'Invalid monitor id.')
  const { isAdmin, isSubAdmin } = await loadPersonaFlags(actor.id)
  if (!isAdmin && !isSubAdmin) {
    throw new PermissionError(
      'Only a Super Admin or Admin may record an exam monitored by someone other than the tutor.',
    )
  }
  const monitor = await getProfileById(requested)
  if (!monitor || monitor.status !== 'active' || !MONITOR_ROLES.includes(monitor.role)) {
    throw new ValidationError('The monitor must be an active tutor, mentor or admin.')
  }
  return requested
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
      // Admin TIER, not the admin persona alone. 0092 gave sub_admin academy-wide
      // authority over class-scoped tables and widened teaches_class() to match, so RLS
      // already accepts a sub_admin inserting this row - the app was refusing what the
      // database permits, which is exactly the app/RLS divergence 0092 set out to remove.
      // Still barred to a tutor or mentor: attributing a session to someone else moves
      // billable hours onto THEIR pay slip (0095), so it stays an academy-authority act.
      const { isAdmin, isSubAdmin } = await loadPersonaFlags(actor.id)
      if (!isAdmin && !isSubAdmin) {
        throw new PermissionError('Only a Super Admin or Admin may record a session for another tutor.')
      }
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
    const loaded = await selectSessionByIdAsService(rawSessionId)
    if (!loaded) throw new NotFoundError('That session no longer exists.')
    if (loaded.class_id !== classId) throw new PermissionError('That session belongs to another class.')
    // A copy: everything below compares against this AFTER the write, and a store that updates the
    // row it handed back in place (the mock one does) would otherwise show no change at all.
    before = { ...loaded }
  }

  // What kind of session this is. Absent keeps an edited session as it was and records a new one
  // as regular - a caller that has never heard of kinds must not be able to reclassify hours.
  const rawKind = String(input.kind ?? '').trim()
  if (rawKind && !isSessionKind(rawKind)) throw new ValidationError('Invalid session type.')
  const kind: SessionKind = rawKind ? (rawKind as SessionKind) : before ? kindOf(before) : 'regular'

  // Who monitored it, which only an exam has. A non-exam always clears the monitor (the database
  // refuses one on any other kind). On an exam, '' means the tutor monitored it and an ABSENT
  // field leaves an edited exam's monitor alone.
  const monitorId =
    kind !== 'exam'
      ? null
      : input.monitor_id == null
        ? (before?.monitor_id ?? null)
        : await resolveExamMonitor(actor, String(input.monitor_id).trim(), tutorId)

  // A tutor cannot teach two classes at once - reject a window that overlaps another of this
  // tutor's sessions. An edit excludes ITSELF by id; a new session excludes nothing. An exam
  // someone else monitored does not put the tutor in the room, so it is not checked against
  // their teaching (the database constraint makes the same exemption, 0123).
  if (!(kind === 'exam' && monitorId)) {
    await assertNoTutorOverlap(tutorId, window.start, window.end, before?.id ?? null)
  }

  // Times + summary are editable by any manageAttendance holder (mentors included, via
  // the action). The staff-PRIVATE note is a higher bar - only a manageClassContent
  // holder (tutor / admin) may set it (the action resolves canEditStaffNote). When the
  // caller lacks it, staff_note is OMITTED from the write entirely, so an existing note
  // is PRESERVED (not cleared) and a mentor can never write it.
  const canEditStaffNote = input.canEditStaffNote ?? false
  const fields = {
    tutor_id: tutorId,
    kind,
    monitor_id: monitorId,
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
  // WHAT was taught is stamped by insertSession, from the class, for every writer rather
  // than only this one - so it is deliberately NOT passed here. An edit leaves it alone,
  // which is the point: correcting yesterday's times must never relabel yesterday's subject.
  const saved = before
    ? await updateSessionById(before.id, fields, before.updated_at)
    : await insertSession({ class_id: classId, session_date: sessionDate, ...fields })
  // The row was read above but the guarded write matched nothing, so another editor saved in
  // between. Without this the last save would win silently, and the audit's `before` plus
  // hours_recorded_by - the pay attestation - would describe an edit that no longer stands.
  if (!saved) {
    throw new ValidationError('This session was changed by someone else - reload and try again.')
  }

  await auditPrivilegedAction(actor, 'attendance.session', 'class', classId, {
    session_id: saved.id,
    session_date: sessionDate,
    before: before
      ? {
          actual_start: before.actual_start,
          actual_end: before.actual_end,
          kind: kindOf(before),
          monitor_id: before.monitor_id ?? null,
        }
      : null,
    after: { actual_start: window.start, actual_end: window.end, kind, monitor_id: monitorId },
  })
  // The monitor gains working time on a class they may not even be on, so without this the first
  // they would hear of it is a figure on My hours. Only when the monitor is new or has changed:
  // re-saving the same exam must not tell them again. Best-effort - the session is already saved.
  if (kind === 'exam' && monitorId && monitorId !== (before?.monitor_id ?? null)) {
    await notifyBestEffort([monitorId], {
      kind: 'class',
      title: 'You were recorded as monitoring an exam',
      body: sessionDate,
      link: '/my-hours',
    })
  }
  // The hours a session records are somebody's pay - the tutor's, or the monitor's of an exam the
  // tutor was not in the room for - so when someone ELSE records or changes it that person has to
  // hear: otherwise the first they know is a figure that is not what they worked. The same rule
  // as the mentor's narrower edit, so the two cannot disagree about who is told.
  const hoursAfter = {
    tutor_id: tutorId,
    kind,
    monitor_id: monitorId,
    actual_start: window.start,
    actual_end: window.end,
  }
  for (const notice of hoursNotices(before, hoursAfter, actor.id)) {
    await notifyBestEffort([notice.personId], {
      kind: 'class',
      title: notice.title,
      body: sessionDate,
      link: '/my-hours',
    })
  }
  // A summary written up for the class is for the student to read, and the page they would read
  // it on is not one they have a reason to open unprompted. Only when it is new or has changed:
  // saving the times again must not tell them again. Best-effort - the session is already saved.
  if (fields.summary && fields.summary !== (before?.summary ?? null)) {
    await notifyClassRoleBestEffort(
      classId,
      ['students', 'tutors', 'mentors'],
      {
        kind: 'class',
        title: 'A class summary was posted',
        body: sessionDate,
        link: `/classroom/${classId}/attendance?date=${sessionDate}`,
      },
      actor.id,
    )
  }
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
  // Whoever the hours were - the tutor, or the monitor of an exam the tutor was not in the room for -
  // loses them: say so. Not the class tutor of an exam someone else monitored; it never counted for them.
  const worker = sessionWorker({
    tutor_id: session.tutor_id,
    kind: kindOf(session),
    monitor_id: session.monitor_id ?? null,
  })
  if (worker && worker !== actor.id) {
    await notifyBestEffort([worker], {
      kind: 'class',
      title: 'A session you worked was removed',
      body: session.session_date,
      link: '/my-hours',
    })
  }
}

export type SaveFeedbackActionInput = {
  classId?: FormDataEntryValue | null
  sessionId?: FormDataEntryValue | null
  feedback?: FormDataEntryValue | null
}

/**
 * A student leaves feedback on one of their own class sessions. Gated on the
 * actor being the class's enrolled student (staff use the summary field instead),
 * then written to THAT session's row: a day may hold several sessions, each with its own
 * note.
 *
 * student_feedback is a single column on the session, not keyed per student. That is
 * safe because a class has exactly ONE active student (enforced by
 * enrollments_one_active_student_per_class), so the session's feedback IS that student's.
 * If multi-student classes are ever introduced, this must move to a per-(session, student)
 * table before feedback can be attributed or isolated per student.
 */
export async function saveSessionFeedback(actor: Profile, input: SaveFeedbackActionInput): Promise<void> {
  const classId = String(input.classId ?? '')
  const sessionId = String(input.sessionId ?? '')
  if (!z.string().uuid().safeParse(sessionId).success) {
    throw new ValidationError('Invalid session.')
  }
  const enrolledClassIds = await selectActiveClassIdsForStudent(actor.id)
  if (!enrolledClassIds.includes(classId)) {
    throw new PermissionError('Only the enrolled student can leave feedback for this class.')
  }
  // Feedback is per REAL session: the student must have been marked in THIS session (that
  // is the only place the feedback field is surfaced), so a crafted POST cannot write onto a
  // session they did not attend.
  if (!(await studentHasAttendance(classId, actor.id, sessionId))) {
    throw new ValidationError('You can leave feedback only for a session you attended.')
  }
  const feedback = noteField.parse(String(input.feedback ?? ''))
  await writeStudentSessionFeedback(classId, sessionId, feedback)
  await auditPrivilegedAction(actor, 'attendance.feedback', 'class', classId)
  // The tutor otherwise finds a student's feedback only by opening that day's form and looking.
  if (feedback) {
    // The date comes from the session itself, never from the request. Best-effort like the notice.
    const sessionDate = (await selectSessionByIdAsService(sessionId).catch(() => null))?.session_date
    await notifyClassRoleBestEffort(classId, ['tutors', 'mentors'], {
      kind: 'class',
      title: 'A student left feedback on a session',
      body: sessionDate ?? null,
      link: `/classroom/${classId}/attendance${sessionDate ? `?date=${sessionDate}` : ''}`,
    })
  }
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

/** The sessions a NAMED set of ids belongs to - bounded by the caller's page. */
export async function listSessionsByIds(ids: string[]): Promise<ClassSession[]> {
  return selectSessionsByIds(ids)
}
