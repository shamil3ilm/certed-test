'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { actionFail, actionOk, toActionError, type ActionResult } from '@/lib/api/action-error'
import { clearAttendanceSession, markAttendance, type MarkAttendanceInput } from '@/lib/services/attendance'
import { PermissionError, ServiceError } from '@/lib/errors'

/**
 * Marks a whole class for one session date in a single atomic write. Each
 * student's status arrives as a `status:<studentId>` field. Permission check,
 * roster-membership filtering, and audit all happen inside the service.
 */
export async function markAttendanceAction(formData: FormData): Promise<ActionResult<{ saved: number }>> {
  const me = await requireCapability('manageClassContent')
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
  const me = await requireCapability('manageClassContent')
  const classId = String(formData.get('class_id') ?? '')
  const date = String(formData.get('session_date') ?? '')
  if (!classId || !date) return

  try {
    await clearAttendanceSession(me, classId, date)
    revalidatePath(`/classroom/${classId}/attendance`)
  } catch (e) {
    // A permission denial leaves the marks intact silently - the control isn't
    // shown to someone who can't manage this class, so this is defence in depth.
    // Any OTHER ServiceError (e.g. an invalid/stale session_date) is a real,
    // user-correctable failure: surface it as an inline banner instead of a
    // silent no-op. A non-ServiceError is an unexpected fault - rethrow.
    // redirect() throws NEXT_REDIRECT, so it must be the last thing in the branch.
    if (e instanceof PermissionError) return
    // Carry the session date back so the banner shows on the SAME roster the
    // manager was clearing, not a reset to today's default date.
    if (e instanceof ServiceError) {
      redirect(`/classroom/${classId}/attendance?${new URLSearchParams({ date, error: '1' }).toString()}`)
    }
    throw e
  }
}
