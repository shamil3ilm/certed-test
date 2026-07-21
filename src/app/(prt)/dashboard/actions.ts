'use server'
import { revalidatePath } from 'next/cache'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { requireCapability } from '@/lib/auth/require-role'
import { createReminderFromActionInput, deleteReminder, markReminderSent } from '@/lib/services/reminders'

// Reminders are a dashboard feature (personal + own-scoped by RLS), so these
// guard on viewDashboard - the same capability that gates the dashboard page and
// its nav entry. Every base persona holds it (mentors included); gating on the
// capability rather than mere active-session keeps a future persona without
// dashboard access from mutating reminders by hitting the action directly.
export async function createReminderAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('viewDashboard')
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
  await requireCapability('viewDashboard')
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
  await requireCapability('viewDashboard')
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
