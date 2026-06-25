'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createAnnouncementSchema } from '@/lib/validation/announcement'
import { createAnnouncement, updateAnnouncement } from '@/lib/repos/announcements'

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
  await createAnnouncement({
    course_id: parsed.data.course_id ?? null,
    title: parsed.data.title,
    message: parsed.data.message,
    author_id: me.id,
  })
  revalidatePath('/announcements')
}

export async function archiveAnnouncementAction(formData: FormData) {
  await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await updateAnnouncement(id, { status: 'archived' })
  revalidatePath('/announcements')
}
