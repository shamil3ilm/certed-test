'use server'
import { revalidatePath } from 'next/cache'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { requireRole } from '@/lib/auth/require-role'
import { ServiceError } from '@/lib/errors'
import {
  ensureActiveSubmissionId,
  recordSubmissionFromActionInput,
  withdrawSubmissionFromActionInput,
} from '@/lib/services/submissions'

/**
 * Submit work as a Google Drive link - the pasted-link fallback kept alongside the
 * primary custodial file upload (the old client-side Drive Picker is gone).
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
    revalidatePath('/(prt)/classroom', 'layout')
    revalidatePath('/(prt)/assignments', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

/**
 * Ensure the student has an active submission for this assignment and return its id,
 * so the client can upload a file to it via /api/attachments. Creates an empty
 * (no-link) submission on the first upload and reuses it afterwards. Returns a plain
 * result (not the status envelope) because the client needs the id.
 */
export async function startSubmissionAction(
  assignmentId: string,
): Promise<{ ok: true; submissionId: string } | { ok: false; error: string }> {
  const me = await requireRole(['student'])
  try {
    const submissionId = await ensureActiveSubmissionId(me, assignmentId)
    revalidatePath('/(prt)/classroom', 'layout')
    revalidatePath('/(prt)/assignments', 'layout')
    return { ok: true, submissionId }
  } catch (error) {
    // ServiceError messages are already user-safe (deadline closed / not enrolled);
    // anything else degrades to a generic line rather than leaking internals.
    return { ok: false, error: error instanceof ServiceError ? error.message : 'Could not start your submission.' }
  }
}

/** Withdraw the student's own still-ungraded submission so they can resubmit later.
 *  Same role/RLS boundary as submitting; the service blocks graded work. */
export async function withdrawSubmissionAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireRole(['student'])
  try {
    await withdrawSubmissionFromActionInput(me, { submission_id: formData.get('submission_id') })
    revalidatePath('/(prt)/classroom', 'layout')
    revalidatePath('/(prt)/assignments', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}
