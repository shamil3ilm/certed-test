'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { canManageClass } from '@/lib/repos/classes'
import { markAttendance } from '@/lib/repos/attendance'
import { attendanceMarkSchema } from '@/lib/validation/attendance'
import { writeAudit } from '@/lib/repos/audit'

/**
 * Marks a whole class for one session date. Each student's status arrives as a
 * `status:<studentId>` field. Gated by canManageClass (a tutor of THIS class or
 * an admin); individual rows that fail validation are skipped, not fatal.
 */
export async function markAttendanceAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const classId = String(formData.get('class_id') ?? '')
  const date = String(formData.get('session_date') ?? '')
  if (!classId || !(await canManageClass(me, classId))) return

  let saved = 0
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('status:')) continue
    const parsed = attendanceMarkSchema.safeParse({
      class_id: classId,
      student_id: key.slice('status:'.length),
      session_date: date,
      status: String(value),
    })
    if (!parsed.success) continue
    await markAttendance({ ...parsed.data, marked_by: me.id })
    saved += 1
  }

  if (saved > 0) {
    await writeAudit({ actor_id: me.id, action: 'attendance.mark', entity_type: 'class', entity_id: classId })
    revalidatePath(`/classroom/${classId}/attendance`)
  }
}
