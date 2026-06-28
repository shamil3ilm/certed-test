'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createLinkResource } from '@/lib/repos/resources'
import { createResourceComment } from '@/lib/repos/resourceComments'
import { z } from 'zod'

const linkResourceSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url(),
})

export async function createLinkResourceAction(formData: FormData) {
  const me = await requireRole(['teacher', 'admin'])

  const parsed = linkResourceSchema.safeParse({
    courseId: formData.get('courseId'),
    title: formData.get('title'),
    url: formData.get('url'),
  })

  if (!parsed.success) {
    throw new Error('Invalid input data')
  }

  const { courseId, title, url } = parsed.data
  await createLinkResource({
    course_id: courseId,
    title,
    drive_link: url,
    uploaded_by: me.id,
  })

  revalidatePath('/resources')
}

export async function addResourceCommentAction(formData: FormData) {
  const me = await requireRole(['teacher', 'admin', 'student'])

  const resourceId = formData.get('resourceId') as string
  const content = formData.get('content') as string

  if (!resourceId || !content?.trim()) {
    throw new Error('Missing comment details')
  }

  await createResourceComment(resourceId, me.id, content.trim())
  revalidatePath('/resources')
}
