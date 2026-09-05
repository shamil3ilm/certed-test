'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { ServiceError } from '@/lib/errors'
import { requireCapability } from '@/lib/auth/require-role'
import {
  createMeetLinkFromActionInput,
  deleteMeetLink,
  editMeetLinkFromActionInput,
  restoreMeetLink,
} from '@/lib/services/meet-links'

export async function createMeetLinkAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await createMeetLinkFromActionInput(me, {
      classId: formData.get('classId'),
      title: formData.get('title'),
      url: formData.get('url'),
      description: formData.get('description'),
      scheduled_at: formData.get('scheduled_at'),
    })
    revalidatePath('/(prt)/classroom', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

export async function editMeetLinkAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await editMeetLinkFromActionInput(me, {
      id: formData.get('id'),
      title: formData.get('title'),
      url: formData.get('url'),
      description: formData.get('description'),
      scheduled_at: formData.get('scheduled_at'),
    })
    revalidatePath('/(prt)/classroom', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteMeetLinkAction(id: string): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await deleteMeetLink(me, id)
    revalidatePath('/(prt)/classroom', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

/**
 * Native `<form action>` on the class stream (bound to the link + its class), so
 * it matches the other restore actions: a service error surfaces as the stream's
 * inline banner via `?error=meet` rather than crashing the Server Action.
 * redirect() throws, so it stays outside the catch.
 */
export async function restoreMeetLinkAction(id: string, streamClassId: string): Promise<void> {
  const me = await requireCapability('manageClassContent')
  try {
    await restoreMeetLink(me, id)
  } catch (error) {
    if (error instanceof ServiceError) redirect(`/classroom/${streamClassId}?error=meet`)
    throw error
  }
  revalidatePath('/(prt)/classroom', 'layout')
}
