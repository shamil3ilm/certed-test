import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { isCalendarDate } from '@/lib/time/format'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError } from '@/lib/errors'
import {
  selectRecentSessions,
  selectSession,
  upsertSession,
  upsertSessionStudentFeedback,
  type ClassSessionRow,
} from '@/lib/data/class-sessions'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
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

const sessionTimesSchema = z.object({
  scheduled_start: isoOrNull,
  scheduled_end: isoOrNull,
  actual_start: isoOrNull,
  actual_end: isoOrNull,
  tutor_join_at: isoOrNull,
  tutor_leave_at: isoOrNull,
})

export type SaveSessionActionInput = {
  classId?: FormDataEntryValue | null
  sessionDate?: FormDataEntryValue | null
  tutor_id?: FormDataEntryValue | null
  scheduled_start?: FormDataEntryValue | null
  scheduled_end?: FormDataEntryValue | null
  actual_start?: FormDataEntryValue | null
  actual_end?: FormDataEntryValue | null
  tutor_join_at?: FormDataEntryValue | null
  tutor_leave_at?: FormDataEntryValue | null
  summary?: FormDataEntryValue | null
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
    scheduled_start: String(input.scheduled_start ?? ''),
    scheduled_end: String(input.scheduled_end ?? ''),
    actual_start: String(input.actual_start ?? ''),
    actual_end: String(input.actual_end ?? ''),
    tutor_join_at: String(input.tutor_join_at ?? ''),
    tutor_leave_at: String(input.tutor_leave_at ?? ''),
  })
  if (!parsed.success) {
    throw new ValidationError('Invalid session times.')
  }
  // Default the tutor to whoever is recording (usually the class tutor); an admin
  // may pass an explicit tutor_id.
  const tutorId = String(input.tutor_id ?? '') || actor.id

  const saved = await upsertSession({
    class_id: classId,
    session_date: sessionDate,
    tutor_id: tutorId,
    ...parsed.data,
    summary: noteField.parse(String(input.summary ?? '')),
  })
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
  await upsertSessionStudentFeedback(classId, sessionDate, noteField.parse(String(input.feedback ?? '')))
  await auditPrivilegedAction(actor, 'attendance.feedback', 'class', classId)
}

export async function getSession(classId: string, date: string): Promise<ClassSession | null> {
  return selectSession(classId, date)
}

export async function listRecentSessions(classId: string, limit?: number): Promise<ClassSession[]> {
  return selectRecentSessions(classId, limit)
}
