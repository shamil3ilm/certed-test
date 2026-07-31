'use server'

import { revalidatePath } from 'next/cache'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { requireCapability } from '@/lib/auth/require-role'
import { createLinkResourceFromActionInput, editResourceFromActionInput } from '@/lib/services/resources'

export async function createLinkResourceAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await createLinkResourceFromActionInput(me, {
      classId: formData.get('classId'),
      title: formData.get('title'),
      url: formData.get('url'),
    })
    revalidatePath('/classroom', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

export async function editLinkResourceAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await editResourceFromActionInput(me, {
      id: formData.get('id'),
      title: formData.get('title'),
      url: formData.get('url'),
    })
    revalidatePath('/classroom', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}
