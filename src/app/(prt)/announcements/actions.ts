'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createAnnouncementSchema } from '@/lib/validation/announcement'
import {
  createAnnouncement,
  archiveAnnouncement,
  restoreAnnouncement,
  editAnnouncement,
} from '@/lib/services/announcements'

export async function createAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const rawClass = String(formData.get('class_id') ?? '')
  const parsed = createAnnouncementSchema.safeParse({
    class_id: rawClass === '' ? null : rawClass,
    title: String(formData.get('title') ?? ''),
    message: String(formData.get('message') ?? ''),
  })
  if (!parsed.success) return
  await createAnnouncement(me, {
    class_id: parsed.data.class_id ?? null,
    title: parsed.data.title,
    message: parsed.data.message,
  })
  revalidatePath('/classroom', 'layout')
}

export async function archiveAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await archiveAnnouncement(me, id)
  revalidatePath('/classroom', 'layout')
}

export async function restoreAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await restoreAnnouncement(me, id)
  revalidatePath('/classroom', 'layout')
}

export async function editAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const message = String(formData.get('message') ?? '').trim()
  if (!id || !title || !message) return
  await editAnnouncement(me, id, { title, message })
  revalidatePath('/classroom', 'layout')
}
