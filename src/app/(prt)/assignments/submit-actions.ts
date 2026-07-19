'use server'
import { revalidatePath } from 'next/cache'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { requireRole } from '@/lib/auth/require-role'
import { recordSubmissionFromActionInput } from '@/lib/services/submissions'

/**
 * Submit work as a Google Drive link — pasted, or picked via the Drive Picker
 * (which uploads to the student's own Drive and returns its share URL).
 * RLS enforces enrolled + own; the status is computed server-side vs the due date.
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
