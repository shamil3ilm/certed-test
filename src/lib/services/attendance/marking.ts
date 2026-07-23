import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { getClassMembers } from '@/lib/services/classes'
import { attendanceMarkSchema } from '@/lib/validation/attendance'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError } from '@/lib/errors'
import { deleteSession, upsertMarks, type AttendanceMark } from '@/lib/data/attendance'

/** Recording and correcting a session's attendance. Both paths are gated on
 *  canManageClass (a tutor of THIS class, or an admin) and audited. */

export type MarkAttendanceInput = { student_id: string; status: string }

/**
 * Marks a whole class for one session date in a single atomic write.
 *
 * Every student_id must be on this class's roster. That check is the security
 * boundary, not a convenience: without it a forged status:<foreignId> would
 * create a cross-class attendance row and pollute that student's report card.
 * Marks that fail validation or the roster check are dropped, and if nothing
 * survives the caller is told rather than silently writing nothing.
 */
export async function markAttendance(
  actor: Profile,
  params: { classId: string; sessionDate: string; marks: MarkAttendanceInput[] },
): Promise<{ saved: number }> {
  if (!(await canManageClass(actor, params.classId))) {
    throw new PermissionError('Not allowed to mark attendance for this class.')
  }
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
    if (parsed.success) rows.push({ ...parsed.data, marked_by: actor.id })
  }
  if (rows.length === 0) throw new ValidationError('Nothing to save - check the date and roster.')

  await upsertMarks(rows)
  await auditPrivilegedAction(actor, 'attendance.mark', 'class', params.classId)
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    throw new ValidationError('Invalid session date.')
  }
  const cleared = await deleteSession(classId, sessionDate)
  await auditPrivilegedAction(actor, 'attendance.clear', 'class', classId)
  return { cleared }
}
