'use server'
import { revalidatePath } from 'next/cache'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { requireRole } from '@/lib/auth/require-role'
import { recordSubmissionFromActionInput, withdrawSubmissionFromActionInput } from '@/lib/services/submissions'

/**
 * Submit work as a Google Drive link - pasted, or picked via the Drive Picker
 * (which uploads to the student's own Drive and returns its share URL).
 * RLS enforces enrolled + own; the status is computed server-side vs the due date.
 *
 * DELIBERATE role guard, not capability drift: submitting is inherently a student
 * self-service action (there is no "submit on behalf of" capability to model), and
 * RLS (enrolled + own) is the real trust boundary. Keep it role-based.
 */
export async function submitLinkAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireRole(['student'])
  try {
    await recordSubmissionFromActionInput(me, {
      assignment_id: formData.get('assignment_id'),
      url: formData.get('url'),
      file_name: formData.get('file_name'),
    })
    revalidatePath('/classroom', 'layout')
    revalidatePath('/assignments', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

/** Withdraw the student's own still-ungraded submission so they can resubmit later.
 *  Same role/RLS boundary as submitting; the service blocks graded work. */
export async function withdrawSubmissionAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireRole(['student'])
  try {
    await withdrawSubmissionFromActionInput(me, { submission_id: formData.get('submission_id') })
    revalidatePath('/classroom', 'layout')
    revalidatePath('/assignments', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}
