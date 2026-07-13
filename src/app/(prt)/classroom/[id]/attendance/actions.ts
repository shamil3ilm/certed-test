'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { canManageClass, getClassMembers } from '@/lib/repos/classes'
import { markAttendanceMany, type AttendanceMark } from '@/lib/repos/attendance'
import { attendanceMarkSchema } from '@/lib/validation/attendance'
import { writeAudit } from '@/lib/repos/audit'

/**
 * Marks a whole class for one session date in a single atomic write. Each
 * student's status arrives as a `status:<studentId>` field. Gated by
 * canManageClass (a tutor of THIS class or an admin) and — critically — each
 * student_id must be on this class's roster, so a forged status:<foreignId>
 * can't create a cross-class attendance row (which would pollute that student's
 * report card).
 */
export async function markAttendanceAction(
  formData: FormData,
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  const me = await requireRole(['admin', 'teacher'])
  const classId = String(formData.get('class_id') ?? '')
  const date = String(formData.get('session_date') ?? '')
  if (!classId || !(await canManageClass(me, classId))) {
    return { ok: false, error: 'Not allowed to mark attendance for this class.' }
  }

  const { students } = await getClassMembers(classId)
  const enrolled = new Set(students.map((s) => s.id))

  const rows: AttendanceMark[] = []
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('status:')) continue
    const studentId = key.slice('status:'.length)
    if (!enrolled.has(studentId)) continue // reject anyone not on this class's roster
    const parsed = attendanceMarkSchema.safeParse({
      class_id: classId,
      student_id: studentId,
      session_date: date,
      status: String(value),
    })
    if (parsed.success) rows.push({ ...parsed.data, marked_by: me.id })
  }
  if (rows.length === 0) return { ok: false, error: 'Nothing to save — check the date and roster.' }

  await markAttendanceMany(rows)
  await writeAudit({ actor_id: me.id, action: 'attendance.mark', entity_type: 'class', entity_id: classId })
  revalidatePath(`/classroom/${classId}/attendance`)
  return { ok: true, saved: rows.length }
}
