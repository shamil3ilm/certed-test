'use server'

import { revalidatePath } from 'next/cache'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { requireCapability } from '@/lib/auth/require-role'
import { ServiceError } from '@/lib/errors'
import {
  createCustodialDocumentFromActionInput,
  createDocumentFromActionInput,
  editDocumentFromActionInput,
} from '@/lib/services/resources'

/** Pulls the document metadata fields off a submitted form. The service
 *  validates + defaults them; here we only forward. */
function documentFields(formData: FormData) {
  return {
    classId: formData.get('classId'),
    id: formData.get('id'),
    title: formData.get('title'),
    url: formData.get('url'),
    description: formData.get('description'),
    category: formData.get('category'),
    subject: formData.get('subject'),
    file_type: formData.get('file_type'),
    visibility: formData.get('visibility'),
  }
}

export async function createDocumentAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await createDocumentFromActionInput(me, documentFields(formData))
    revalidatePath('/classroom', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

/**
 * Create a CUSTODIAL document (no Drive link) and return its id, so the client can
 * upload the file to it via /api/attachments. Returns a plain result (not the status
 * envelope) because the client needs the id to attach.
 */
export async function createCustodialDocumentAction(
  formData: FormData,
): Promise<{ ok: true; resourceId: string } | { ok: false; error: string }> {
  const me = await requireCapability('manageClassContent')
  try {
    const doc = await createCustodialDocumentFromActionInput(me, documentFields(formData))
    revalidatePath('/classroom', 'layout')
    return { ok: true, resourceId: doc.id }
  } catch (error) {
    return { ok: false, error: error instanceof ServiceError ? error.message : 'Could not create the document.' }
  }
}

export async function editDocumentAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await editDocumentFromActionInput(me, documentFields(formData))
    revalidatePath('/classroom', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}
