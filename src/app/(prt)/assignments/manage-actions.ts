'use server'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth/require-role'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { archiveAssignmentFromActionInput, editAssignmentFromActionInput } from '@/lib/services/assignments'
import { gradeSubmissionFromActionInput } from '@/lib/services/submissions'
import { archiveResourceFromActionInput, restoreResourceFromActionInput } from '@/lib/services/resources'

// Permission check + audit on every mutation now happens inside each service
// and action-input parsing lives with the owning domain service.

export async function archiveAssignmentAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  await archiveAssignmentFromActionInput(me, {
    id: formData.get('id'),
    status: formData.get('status'),
  })
  revalidatePath('/classroom', 'layout')
}

/** `due_date` arrives already converted to an ISO instant by the client. */
export async function editAssignmentAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await editAssignmentFromActionInput(me, {
      id: formData.get('id'),
      title: formData.get('title'),
      description: formData.get('description'),
      due_date: formData.get('due_date'),
      attachment_drive_link: formData.get('attachment_drive_link'),
    })
    revalidatePath('/classroom', 'layout')
    return actionDone()
  } catch (e) {
    return toActionError(e)
  }
}

/**
 * Tutor grades one submission (mark + optional feedback). Permission check,
 * grading-race guard, max-marks validation, and audit all happen inside the
 * service. An empty mark clears a previous score.
 */
export async function gradeSubmissionAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('viewGrading') // grading matches the grading/assignment-detail pages
  try {
    const { assignmentId } = await gradeSubmissionFromActionInput(me, {
      submission_id: formData.get('submission_id'),
      score: formData.get('score'),
      feedback: formData.get('feedback'),
    })
    revalidatePath('/classroom', 'layout')
    revalidatePath(`/assignments/${assignmentId}`)
    return actionDone()
  } catch (e) {
    return toActionError(e)
  }
}

/** Soft-remove a material (kept on record via status='archived'). */
export async function deleteResourceAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  await archiveResourceFromActionInput(me, { id: formData.get('id') })
  revalidatePath('/classroom', 'layout')
}

export async function restoreResourceAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  await restoreResourceFromActionInput(me, { id: formData.get('id') })
  revalidatePath('/classroom', 'layout')
}
