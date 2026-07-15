'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createReminder, deleteReminder } from '@/lib/services/reminders'
import { createReminderSchema } from '@/lib/validation/reminder'

export async function createReminderAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const parsed = createReminderSchema.safeParse({
    title: formData.get('title'),
    description: String(formData.get('description') ?? '').trim() || undefined,
    remind_at: formData.get('remind_at'),
  })
  if (!parsed.success) return
  await createReminder(me.id, parsed.data.title, parsed.data.description ?? null, parsed.data.remind_at)
  revalidatePath('/dashboard')
}

export async function deleteReminderAction(formData: FormData) {
  await requireRole(['admin', 'teacher', 'student'])
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return
  await deleteReminder(id)
  revalidatePath('/dashboard')
}
