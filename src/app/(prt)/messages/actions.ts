'use server'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth/require-role'
import { actionOk, actionDone, actionFail, toActionError, type ActionResult, type ActionStatusResult } from '@/lib/api/action-error'
import { createConversation, sendMessage, markRead } from '@/lib/services/messaging'

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

/**
 * Start a conversation with one or more allowed recipients (1 -> direct,
 * many -> group), optionally with a first message. Returns the new/reused
 * conversation id so the client can navigate; recipient eligibility and 1:1
 * dedupe are enforced in createConversation.
 */
export async function startConversationAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const me = await requireCapability('viewMessages')
  const recipientIds = formData.getAll('recipient_ids').map(String).filter(Boolean)
  const body = String(formData.get('body') ?? '')
  try {
    if (recipientIds.length === 0) return actionFail('Pick at least one recipient.')
    const { id } = await createConversation(me, { recipientIds })
    if (body.trim()) await sendMessage(me, id, body)
    return actionOk({ id })
  } catch (e) {
    return toActionError(e)
  }
}

/** Marks the current conversation read for the caller (called on thread open). */
export async function markReadAction(conversationId: string): Promise<void> {
  const me = await requireCapability('viewMessages')
  if (!conversationId) return
  try {
    await markRead(me, conversationId)
    revalidatePath('/messages')
  } catch {
    // Best-effort: not a participant (or a transient failure) -> leave read state as-is.
  }
}
