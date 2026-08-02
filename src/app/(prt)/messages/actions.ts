'use server'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth/require-role'
import {
  actionOk,
  actionDone,
  actionFail,
  toActionError,
  type ActionResult,
  type ActionStatusResult,
} from '@/lib/api/action-error'
import { redirect } from 'next/navigation'
import {
  createConversation,
  leaveConversation,
  markRead,
  renameConversation,
  sendMessage,
} from '@/lib/services/messaging'
import { ServiceError } from '@/lib/errors'

/** Post a message to an existing conversation, then refresh the thread. Returns
 *  a result so the composer can surface a failure (toast) instead of the send
 *  vanishing silently. */
export async function sendMessageAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('viewMessages')
  const conversationId = String(formData.get('conversation_id') ?? '')
  const body = String(formData.get('body') ?? '')
  try {
    await sendMessage(me, conversationId, body)
    revalidatePath(`/messages/${conversationId}`)
    return actionDone()
  } catch (e) {
    return toActionError(e)
  }
}

/** Open a conversation with one or more allowed recipients (1 -> direct,
 *  many -> group). Returns the new/reused conversation id so the client can
 *  navigate; recipient eligibility and direct dedupe are enforced in the
 *  messaging domain service. */
export async function startConversationAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const me = await requireCapability('viewMessages')
  const recipientIds = formData.getAll('recipient_ids').map(String).filter(Boolean)
  try {
    if (recipientIds.length === 0) return actionFail('Pick at least one recipient.')
    const { id } = await createConversation(me, { recipientIds })
    return actionOk({ id })
  } catch (e) {
    return toActionError(e)
  }
}

export async function renameConversationAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('viewMessages')
  const conversationId = String(formData.get('conversation_id') ?? '')
  const title = String(formData.get('title') ?? '')
  try {
    await renameConversation(me, conversationId, title)
    revalidatePath(`/messages/${conversationId}`)
    revalidatePath('/messages')
    return actionDone()
  } catch (e) {
    return toActionError(e)
  }
}

/** The caller leaves a conversation, then lands back on the inbox. */
export async function leaveConversationAction(formData: FormData): Promise<void> {
  const me = await requireCapability('viewMessages')
  const conversationId = String(formData.get('conversation_id') ?? '')
  if (conversationId) {
    try {
      await leaveConversation(me, conversationId)
    } catch (e) {
      if (e instanceof ServiceError) {
        redirect(`/messages/${conversationId}`)
      }
      throw e
    }
    revalidatePath('/messages')
  }
  redirect('/messages')
}

/** Marks the current conversation read for the caller (called on thread open). */
export async function markReadAction(conversationId: string): Promise<void> {
  const me = await requireCapability('viewMessages')
  if (!conversationId) return
  try {
    await markRead(me, conversationId)
    revalidatePath('/messages')
  } catch (e) {
    // Swallow only an expected denial (e.g. not a participant); let a genuine
    // DB/service error surface rather than silently leaving read state stale.
    if (!(e instanceof ServiceError)) throw e
  }
}
