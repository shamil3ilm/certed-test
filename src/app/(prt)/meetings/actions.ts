'use server'

import { revalidatePath } from 'next/cache'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { requireCapability } from '@/lib/auth/require-role'
import { createMeetLinkFromActionInput, deleteMeetLink, restoreMeetLink } from '@/lib/services/meet-links'

export async function createMeetLinkAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await createMeetLinkFromActionInput(me, {
      classId: formData.get('classId'),
      title: formData.get('title'),
      url: formData.get('url'),
      description: formData.get('description'),
    })
    revalidatePath('/classroom', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteMeetLinkAction(id: string): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await deleteMeetLink(me, id)
    revalidatePath('/classroom', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

export async function restoreMeetLinkAction(id: string): Promise<void> {
  const me = await requireCapability('manageClassContent')
  await restoreMeetLink(me, id)
  revalidatePath('/classroom', 'layout')
}
