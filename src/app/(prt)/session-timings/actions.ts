'use server'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth/require-role'
import { actionFail, actionOk, toActionError, type ActionResult } from '@/lib/api/action-error'
import { updateSessionTimes, updateStudentJoinTime } from '@/lib/services/mentor-session-timings'

/**
 * Narrow mentor edit of a student's joined time for one session. The coarse gate
 * here (viewMentees) is the feature gate; the fine authorization (canManageClass -
 * the actor must mentor this class's mentee), server-side validation, and audit all
 * happen inside the service. Nothing else on the session is editable through here.
 */
export async function updateStudentJoinAction(formData: FormData): Promise<ActionResult<{ ok: true }>> {
  const me = await requireCapability('viewMentees')
  const classId = String(formData.get('class_id') ?? '')
  const sessionDate = String(formData.get('session_date') ?? '')
  const joinRaw = String(formData.get('join_at') ?? '')
  if (!classId || !sessionDate) return actionFail('Missing class or date.')
  try {
    await updateStudentJoinTime(me, { classId, sessionDate, joinAt: joinRaw || null })
    revalidatePath('/session-timings')
    return actionOk({ ok: true })
  } catch (e) {
    return toActionError(e)
  }
}

/**
 * Narrow mentor edit of a session's actual window (start + end) for one session. Same
 * shape as the joined-time action: viewMentees is the coarse feature gate here, while the
 * fine authorization (canManageClass), window validation and audit all live in the
 * service. Nothing else on the session (tutor, summary, staff note) is touched.
 */
export async function updateSessionTimesAction(formData: FormData): Promise<ActionResult<{ ok: true }>> {
  const me = await requireCapability('viewMentees')
  const classId = String(formData.get('class_id') ?? '')
  const sessionDate = String(formData.get('session_date') ?? '')
  const startRaw = String(formData.get('start_at') ?? '')
  const endRaw = String(formData.get('end_at') ?? '')
  const expectedUpdatedAt = String(formData.get('expected_updated_at') ?? '') || null
  if (!classId || !sessionDate) return actionFail('Missing class or date.')
  try {
    await updateSessionTimes(me, {
      classId,
      sessionDate,
      startAt: startRaw || null,
      endAt: endRaw || null,
      expectedUpdatedAt,
    })
    revalidatePath('/session-timings')
    return actionOk({ ok: true })
  } catch (e) {
    return toActionError(e)
  }
}
