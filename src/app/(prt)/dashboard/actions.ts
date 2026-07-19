'use server'
import { revalidatePath } from 'next/cache'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { requireActiveProfile } from '@/lib/auth/require-role'
import { createReminderFromActionInput, deleteReminder, markReminderSent } from '@/lib/services/reminders'

// Reminders are personal self-service (own-scoped by RLS), so these guard on an
// active session rather than a fixed role list — anyone who can reach the
// dashboard manages their own reminders, mentors included.
export async function createReminderAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireActiveProfile()
  try {
    await createReminderFromActionInput(me.id, {
      title: formData.get('title'),
      description: formData.get('description'),
      remind_at: formData.get('remind_at'),
    })
    revalidatePath('/dashboard')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteReminderAction(formData: FormData): Promise<ActionStatusResult> {
  await requireActiveProfile()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return actionDone()
  try {
    await deleteReminder(id)
    revalidatePath('/dashboard')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

export async function markReminderSentAction(formData: FormData): Promise<ActionStatusResult> {
  await requireActiveProfile()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return actionDone()
  try {
    await markReminderSent(id)
    revalidatePath('/dashboard')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}
