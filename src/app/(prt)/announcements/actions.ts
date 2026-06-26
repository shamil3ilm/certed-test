'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createAnnouncementSchema } from '@/lib/validation/announcement'
import { createAnnouncement, updateAnnouncement } from '@/lib/repos/announcements'
import { writeAudit } from '@/lib/repos/audit'

export async function createAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const rawCourse = String(formData.get('course_id') ?? '')
  const parsed = createAnnouncementSchema.safeParse({
    course_id: rawCourse === '' ? null : rawCourse,
    title: String(formData.get('title') ?? ''),
    message: String(formData.get('message') ?? ''),
  })
  if (!parsed.success) return
  // RLS enforces the fine-grained rule: a teacher can only post to courses they
  // teach; a global (null course) announcement is admin-only.
  const created = await createAnnouncement({
    course_id: parsed.data.course_id ?? null,
    title: parsed.data.title,
    message: parsed.data.message,
    author_id: me.id,
  })
  await writeAudit({ actor_id: me.id, action: 'announcement.create', entity_type: 'announcement', entity_id: created.id })
  revalidatePath('/announcements')
}

export async function archiveAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await updateAnnouncement(id, { status: 'archived' })
  await writeAudit({ actor_id: me.id, action: 'announcement.archive', entity_type: 'announcement', entity_id: id })
  revalidatePath('/announcements')
}

export async function editAnnouncementAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const message = String(formData.get('message') ?? '').trim()
  if (!id || !title || !message) return
  // RLS still enforces that only an admin or the course's teacher can update.
  await updateAnnouncement(id, { title, message })
  await writeAudit({ actor_id: me.id, action: 'announcement.edit', entity_type: 'announcement', entity_id: id })
  revalidatePath('/announcements')
}
