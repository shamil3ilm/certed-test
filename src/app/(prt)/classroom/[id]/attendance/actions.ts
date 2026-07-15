'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { markAttendance, type MarkAttendanceInput } from '@/lib/services/attendance'
import { ServiceError } from '@/lib/errors'

/**
 * Marks a whole class for one session date in a single atomic write. Each
 * student's status arrives as a `status:<studentId>` field. Permission check,
 * roster-membership filtering, and audit all happen inside the service.
 */
export async function markAttendanceAction(
  formData: FormData,
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  const me = await requireRole(['admin', 'teacher'])
  const classId = String(formData.get('class_id') ?? '')
  const date = String(formData.get('session_date') ?? '')
  if (!classId) return { ok: false, error: 'Missing class or date.' }

  const marks: MarkAttendanceInput[] = []
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('status:')) continue
    marks.push({ student_id: key.slice('status:'.length), status: String(value) })
  }

  try {
    const { saved } = await markAttendance(me, { classId, sessionDate: date, marks })
    revalidatePath(`/classroom/${classId}/attendance`)
    return { ok: true, saved }
  } catch (e) {
    return { ok: false, error: e instanceof ServiceError ? e.message : 'Something went wrong. Please try again.' }
  }
}
