'use server'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth/require-role'
import {
  createAnnouncementFromActionInput,
  archiveAnnouncement,
  restoreAnnouncement,
  editAnnouncementFromActionInput,
} from '@/lib/services/announcements'

export async function createAnnouncementAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  await createAnnouncementFromActionInput(me, {
    class_id: formData.get('class_id'),
    title: formData.get('title'),
    message: formData.get('message'),
  })
  revalidatePath('/classroom', 'layout')
}

export async function archiveAnnouncementAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await archiveAnnouncement(me, id)
  revalidatePath('/classroom', 'layout')
}

export async function restoreAnnouncementAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await restoreAnnouncement(me, id)
  revalidatePath('/classroom', 'layout')
}

export async function editAnnouncementAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  await editAnnouncementFromActionInput(me, {
    id: formData.get('id'),
    title: formData.get('title'),
    message: formData.get('message'),
  })
  revalidatePath('/classroom', 'layout')
}
