'use server'
import { revalidatePath } from 'next/cache'
import type { Profile } from '@/lib/auth/profile'
import { requireRole } from '@/lib/auth/requireRole'
import { createAnnouncementSchema } from '@/lib/validation/announcement'
import { createAnnouncement, updateAnnouncement, getAnnouncement } from '@/lib/repos/announcements'
import { canManageScope } from '@/lib/repos/classes'
import { writeAudit } from '@/lib/repos/audit'

/** Can this user manage an existing announcement (by its id)? */
async function canManageAnnouncement(me: Profile, id: string): Promise<boolean> {
  const a = await getAnnouncement(id)
  if (!a) return false
  return canManageScope(me, a.class_id)
}

export async function createAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const rawClass = String(formData.get('class_id') ?? '')
  const parsed = createAnnouncementSchema.safeParse({
    class_id: rawClass === '' ? null : rawClass,
    title: String(formData.get('title') ?? ''),
    message: String(formData.get('message') ?? ''),
  })
  if (!parsed.success) return
  const classId = parsed.data.class_id ?? null
  if (!(await canManageScope(me, classId))) return
  const created = await createAnnouncement({
    class_id: classId,
    title: parsed.data.title,
    message: parsed.data.message,
    author_id: me.id,
  })
  await writeAudit({ actor_id: me.id, action: 'announcement.create', entity_type: 'announcement', entity_id: created.id })
  revalidatePath('/classroom', 'layout')
}

export async function archiveAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  if (!id || !(await canManageAnnouncement(me, id))) return
  await updateAnnouncement(id, { status: 'archived' })
  await writeAudit({ actor_id: me.id, action: 'announcement.archive', entity_type: 'announcement', entity_id: id })
  revalidatePath('/classroom', 'layout')
}

export async function restoreAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  if (!id || !(await canManageAnnouncement(me, id))) return
  await updateAnnouncement(id, { status: 'active' })
  await writeAudit({ actor_id: me.id, action: 'announcement.restore', entity_type: 'announcement', entity_id: id })
  revalidatePath('/classroom', 'layout')
}

export async function editAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const message = String(formData.get('message') ?? '').trim()
  if (!id || !title || !message || !(await canManageAnnouncement(me, id))) return
  await updateAnnouncement(id, { title, message })
  await writeAudit({ actor_id: me.id, action: 'announcement.edit', entity_type: 'announcement', entity_id: id })
  revalidatePath('/classroom', 'layout')
}
