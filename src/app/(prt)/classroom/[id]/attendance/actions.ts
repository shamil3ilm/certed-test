'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import { actionFail, actionOk, toActionError, type ActionResult } from '@/lib/api/action-error'
import {
  clearAttendanceSession,
  markAttendance,
  deleteSessionTimes,
  saveSessionTimes,
  saveSessionFeedback,
  type MarkAttendanceInput,
} from '@/lib/services/attendance'
import { PermissionError, ServiceError } from '@/lib/errors'

/**
 * Marks a whole class for one session date in a single atomic write. Each
 * student's status arrives as a `status:<studentId>` field. Permission check,
 * roster-membership filtering, and audit all happen inside the service.
 */
export async function markAttendanceAction(formData: FormData): Promise<ActionResult<{ saved: number }>> {
  const me = await requireCapability('manageAttendance')
  const classId = String(formData.get('class_id') ?? '')
  const date = String(formData.get('session_date') ?? '')
  if (!classId || !date) return actionFail('Missing class or date.')

  // Each student's status arrives as `status:<id>`, with optional join/leave times
  // as `join:<id>` / `leave:<id>`. Collect them per student; only students given a
  // status are marked.
  const byStudent = new Map<string, MarkAttendanceInput>()
  const forStudent = (id: string) => {
    const existing = byStudent.get(id)
    if (existing) return existing
    const created: MarkAttendanceInput = { student_id: id, status: '' }
    byStudent.set(id, created)
    return created
  }
  for (const [key, value] of formData.entries()) {
    const v = String(value)
    if (key.startsWith('status:')) forStudent(key.slice('status:'.length)).status = v
    else if (key.startsWith('join:')) forStudent(key.slice('join:'.length)).join_at = v || null
    else if (key.startsWith('leave:')) forStudent(key.slice('leave:'.length)).leave_at = v || null
  }
  const marks = [...byStudent.values()].filter((m) => m.status)

  try {
    const { saved } = await markAttendance(me, {
      classId,
      sessionDate: date,
      // Present when marking a specific session's roster; absent records/uses the day's.
      sessionId: String(formData.get('session_id') ?? '') || undefined,
      marks,
    })
    revalidatePath(`/classroom/${classId}/attendance`)
    return actionOk({ saved })
  } catch (e) {
    return toActionError(e)
  }
}

/** Records the session - times + the student-shared summary. A mentor overseeing a
 *  mentee may edit these (manageAttendance), so that's the transport gate; the service
 *  additionally scopes to the class (canManageClass). The staff-PRIVATE note is a
 *  separate, higher gate applied inside the service (manageClassContent), so a mentor
 *  can edit times/summary but never the private note. The client sends ISO instants. */
export async function saveSessionAction(formData: FormData): Promise<ActionResult<{ ok: true }>> {
  const me = await requireCapability('manageAttendance')
  const classId = String(formData.get('class_id') ?? '')
  // Only a manageClassContent holder (tutor / admin) may write the staff-private note;
  // a mentor editing times/summary cannot. Resolve it here from the actor's capabilities.
  const canEditStaffNote = (await getActorContext()).capabilities.allowed.has('manageClassContent')
  try {
    await saveSessionTimes(me, {
      classId,
      sessionDate: formData.get('session_date'),
      // Present when editing an existing session; absent records a new one.
      sessionId: formData.get('session_id'),
      tutor_id: formData.get('tutor_id'),
      actual_start: formData.get('actual_start'),
      actual_end: formData.get('actual_end'),
      summary: formData.get('summary'),
      staff_note: formData.get('staff_note'),
      canEditStaffNote,
    })
    revalidatePath(`/classroom/${classId}/attendance`)
    return actionOk({ ok: true })
  } catch (e) {
    return toActionError(e)
  }
}

/** A student saves their feedback for one of their own class sessions. The
 *  service gates it on the actor being the class's enrolled student. */
export async function saveFeedbackAction(formData: FormData): Promise<ActionResult<{ ok: true }>> {
  const me = await requireCapability('viewClasses')
  const classId = String(formData.get('class_id') ?? '')
  try {
    await saveSessionFeedback(me, {
      classId,
      sessionDate: formData.get('session_date'),
      feedback: formData.get('feedback'),
    })
    revalidatePath(`/classroom/${classId}/attendance`)
    return actionOk({ ok: true })
  } catch (e) {
    return toActionError(e)
  }
}

/** Clears every mark for a class on one session date (correcting a session recorded
 *  in error). This is a DESTRUCTIVE bulk delete, not routine marking, so it requires
 *  manageClassContent (tutor / admin / sub_admin) - a mentor's manageAttendance lets
 *  them mark/correct, not wipe a whole session. Used as a plain <form> action, so it
 *  returns void; permission + audit also happen inside the service. */
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

/** Remove ONE recorded session. Gated like recording (manageAttendance at the transport,
 *  canManageClass on the session's own class inside the service), so a mentor overseeing
 *  the class may correct a mistaken entry. The monthly hours total recomputes from the
 *  remaining sessions on the next read - nothing is cached. */
export async function deleteSessionAction(formData: FormData): Promise<void> {
  const me = await requireCapability('manageAttendance')
  const classId = String(formData.get('class_id') ?? '')
  const sessionId = String(formData.get('session_id') ?? '')
  const date = String(formData.get('session_date') ?? '')
  if (!classId || !sessionId) return

  try {
    await deleteSessionTimes(me, sessionId)
    revalidatePath(`/classroom/${classId}/attendance`)
  } catch (e) {
    // Same shape as clearAttendanceAction: a denial is a silent no-op (the control is
    // not shown to someone who cannot manage the class), a user-correctable failure
    // comes back as an inline banner, and anything else is a real fault.
    if (e instanceof PermissionError) return
    if (e instanceof ServiceError) {
      redirect(`/classroom/${classId}/attendance?${new URLSearchParams({ date, error: '1' }).toString()}`)
    }
    throw e
  }
}
