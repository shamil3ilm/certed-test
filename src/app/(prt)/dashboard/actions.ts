'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createReminder, deleteReminder } from '@/lib/repos/reminders'

export async function createReminderAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  const remind_at = String(formData.get('remind_at') ?? '').trim()
  if (!title || !remind_at) return
  await createReminder(me.id, title, description, remind_at)
  revalidatePath('/dashboard')
}

export async function deleteReminderAction(formData: FormData) {
  await requireRole(['admin', 'teacher', 'student'])
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return
  await deleteReminder(id)
  revalidatePath('/dashboard')
}
