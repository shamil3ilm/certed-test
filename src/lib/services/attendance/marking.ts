import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { getClassMembers } from '@/lib/services/classes'
import { attendanceMarkSchema } from '@/lib/validation/attendance'
import { isCalendarDate } from '@/lib/time/format'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { notifyBestEffort } from '@/lib/services/notifications'
import { PermissionError, ValidationError } from '@/lib/errors'
import { deleteSession, upsertMarks, type AttendanceMark } from '@/lib/data/attendance'
import { insertSession, selectSessionsForDateAsService } from '@/lib/data/class-sessions'

/** Recording and correcting a session's attendance. Both paths are gated on
 *  canManageClass (a tutor of THIS class, or an admin) and audited. */

export type MarkAttendanceInput = {
  student_id: string
  status: string
  join_at?: string | null
  leave_at?: string | null
}

/** An ISO instant or null - drops anything unparseable rather than storing junk. */
function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  return Number.isNaN(Date.parse(value)) ? null : value
}

/**
 * The session a batch of marks belongs to (0094: attendance is per session, not per day).
 *
 * An explicit id is verified to belong to THIS class and date, so a mark can never be
 * attached to another class's session. With no id - the plain "mark today's roster" flow -
 * the day's first session is used, and if the day has none a timeless session is created:
 * marking attendance asserts a session happened, and recording its times is a separate,
 * optional step. A timeless session contributes zero teaching minutes, so totals are
 * unaffected.
 */
async function resolveMarkingSession(classId: string, sessionDate: string, sessionId?: string): Promise<string> {
  const sessions = await selectSessionsForDateAsService(classId, sessionDate)
  if (sessionId) {
    const named = sessions.find((s) => s.id === sessionId)
    if (!named) throw new ValidationError('That session does not belong to this class and date.')
    return named.id
  }
  if (sessions.length > 0) return sessions[0].id
  const created = await insertSession({ class_id: classId, session_date: sessionDate })
  return created.id
}

/**
 * Marks a whole class for one session in a single atomic write.
 *
 * Every student_id must be on this class's roster. That check is the security
 * boundary, not a convenience: without it a forged status:<foreignId> would
 * create a cross-class attendance row and pollute that student's report card.
 * Marks that fail validation or the roster check are dropped, and if nothing
 * survives the caller is told rather than silently writing nothing.
 */
export async function markAttendance(
  actor: Profile,
  params: { classId: string; sessionDate: string; sessionId?: string; marks: MarkAttendanceInput[] },
): Promise<{ saved: number }> {
  if (!(await canManageClass(actor, params.classId))) {
    throw new PermissionError('Not allowed to mark attendance for this class.')
  }
  const sessionId = await resolveMarkingSession(params.classId, params.sessionDate, params.sessionId)
  const { students } = await getClassMembers(params.classId)
  const enrolled = new Set(students.map((s) => s.id))

  const rows: AttendanceMark[] = []
  for (const m of params.marks) {
    if (!enrolled.has(m.student_id)) continue // reject anyone not on this class's roster
    const parsed = attendanceMarkSchema.safeParse({
      class_id: params.classId,
      student_id: m.student_id,
      session_date: params.sessionDate,
      status: m.status,
    })
    if (parsed.success) {
      rows.push({
        ...parsed.data,
        session_id: sessionId,
        join_at: isoOrNull(m.join_at),
        leave_at: isoOrNull(m.leave_at),
        marked_by: actor.id,
      })
    }
  }
  if (rows.length === 0) throw new ValidationError('Nothing to save - check the date and roster.')

  await upsertMarks(rows)
  await auditPrivilegedAction(actor, 'attendance.mark', 'class', params.classId)
  // Tell the marked students their attendance was recorded (best-effort).
  await notifyBestEffort(
    rows.map((r) => r.student_id),
    {
      kind: 'attendance',
      title: `Attendance recorded for ${params.sessionDate}`,
      link: `/classroom/${params.classId}/attendance`,
    },
  )
  return { saved: rows.length }
}

/**
 * Clears (deletes) every mark for a class on one session date - the correction
 * path for a session recorded in error or on the wrong date. Marking only ever
 * upserts present/late/absent, so without this a mistaken session could be
 * re-marked but never removed.
 */
export async function clearAttendanceSession(
  actor: Profile,
  classId: string,
  sessionDate: string,
): Promise<{ cleared: number }> {
  if (!(await canManageClass(actor, classId))) {
    throw new PermissionError('Not allowed to mark attendance for this class.')
  }
  if (!isCalendarDate(sessionDate)) {
    throw new ValidationError('Invalid session date.')
  }
  const cleared = await deleteSession(classId, sessionDate)
  await auditPrivilegedAction(actor, 'attendance.clear', 'class', classId)
  return { cleared }
}
