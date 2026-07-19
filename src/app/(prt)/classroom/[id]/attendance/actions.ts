'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/require-role'
import { actionFail, actionOk, toActionError, type ActionResult } from '@/lib/api/action-error'
import { clearAttendanceSession, markAttendance, type MarkAttendanceInput } from '@/lib/services/attendance'

/**
 * Marks a whole class for one session date in a single atomic write. Each
 * student's status arrives as a `status:<studentId>` field. Permission check,
 * roster-membership filtering, and audit all happen inside the service.
 */
export async function markAttendanceAction(
  formData: FormData,
): Promise<ActionResult<{ saved: number }>> {
  const me = await requireRole(['admin', 'tutor'])
  const classId = String(formData.get('class_id') ?? '')
  const date = String(formData.get('session_date') ?? '')
  if (!classId || !date) return actionFail('Missing class or date.')

  const marks: MarkAttendanceInput[] = []
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('status:')) continue
    marks.push({ student_id: key.slice('status:'.length), status: String(value) })
  }

  try {
    const { saved } = await markAttendance(me, { classId, sessionDate: date, marks })
    revalidatePath(`/classroom/${classId}/attendance`)
    return actionOk({ saved })
  } catch (e) {
    return toActionError(e)
  }
}

/** Clears every mark for a class on one session date (correcting a session
 *  recorded in error). Used as a plain <form> action, so it returns void; the
 *  page revalidates and re-renders the now-unmarked roster. Permission + audit
 *  happen inside the service. */
export async function clearAttendanceAction(formData: FormData): Promise<void> {
  const me = await requireRole(['admin', 'tutor'])
  const classId = String(formData.get('class_id') ?? '')
  const date = String(formData.get('session_date') ?? '')
  if (!classId || !date) return

  try {
    await clearAttendanceSession(me, classId, date)
    revalidatePath(`/classroom/${classId}/attendance`)
  } catch {
    // Best-effort: a failed clear (e.g. lost permission) leaves the marks intact.
  }
}
