'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { ServiceError } from '@/lib/errors'
import { archiveAssignmentFromActionInput, editAssignmentFromActionInput } from '@/lib/services/assignments'
import { gradeSubmissionFromActionInput } from '@/lib/services/submissions'
import {
  archiveDocumentFromActionInput,
  restoreDocumentFromActionInput,
  restoreDocumentVersionFromActionInput,
} from '@/lib/services/resources'
import { classErrorUrl } from '../action-redirect'

// Keep actions transport-thin: authorization, validation, auditing, and write
// orchestration live in the owning domain services.

// The archive/restore controls below are native `<form action>`s: a service
// error (e.g. acting on a row deleted in a concurrent session) would otherwise
// crash into Next's generic error page. Surface it as an inline banner by
// redirecting back to the classwork page with `?error=1`; the class id travels
// in a hidden `class_id` field. redirect() throws, so it stays outside catch.
const classworkErrorUrl = (formData: FormData) => classErrorUrl(formData, { fields: ['class_id'], sub: 'classwork' })

export async function archiveAssignmentAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  try {
    await archiveAssignmentFromActionInput(me, {
      id: formData.get('id'),
      status: formData.get('status'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(classworkErrorUrl(formData))
    throw error
  }
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
      // topic and max_marks MUST be forwarded: the validator turns a missing
      // value into null, so omitting them here silently wiped both on every edit
      // (a null max_marks drops that assignment's marks from the report-card
      // average). The form always submits them - EditAssignment.tsx.
      topic: formData.get('topic'),
      max_marks: formData.get('max_marks'),
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
  try {
    await archiveDocumentFromActionInput(me, { id: formData.get('id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(classworkErrorUrl(formData))
    throw error
  }
  revalidatePath('/classroom', 'layout')
}

export async function restoreResourceAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  try {
    await restoreDocumentFromActionInput(me, { id: formData.get('id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(classworkErrorUrl(formData))
    throw error
  }
  revalidatePath('/classroom', 'layout')
}

/** Roll a document back to one of its superseded versions. */
export async function restoreVersionAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  try {
    await restoreDocumentVersionFromActionInput(me, {
      resourceId: formData.get('resourceId'),
      versionId: formData.get('versionId'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(classworkErrorUrl(formData))
    throw error
  }
  revalidatePath('/classroom', 'layout')
}
