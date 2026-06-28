'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createMeetLink, deleteMeetLink } from '@/lib/repos/meetLinks'
import { createMeetComment } from '@/lib/repos/meetComments'
import { z } from 'zod'

const meetLinkSchema = z.object({
  courseId: z.string().uuid().nullable().or(z.literal('')),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url(),
  description: z.string().trim().max(1000).optional(),
})

export async function createMeetLinkAction(formData: FormData) {
  const me = await requireRole(['teacher', 'admin'])

  const rawCourseId = formData.get('courseId')
  const courseId = rawCourseId === '' || rawCourseId === 'global' ? null : (rawCourseId as string)

  const parsed = meetLinkSchema.safeParse({
    courseId,
    title: formData.get('title'),
    url: formData.get('url'),
    description: formData.get('description'),
  })

  if (!parsed.success) {
    throw new Error('Invalid meet link data: ' + parsed.error.message)
  }

  const { title, url, description } = parsed.data
  await createMeetLink({
    course_id: courseId || null,
    title,
    url,
    description,
    created_by: me.id,
  })

  revalidatePath('/meetings')
}

export async function deleteMeetLinkAction(id: string) {
  await requireRole(['teacher', 'admin'])
  await deleteMeetLink(id)
  revalidatePath('/meetings')
}

export async function addMeetCommentAction(formData: FormData) {
  const me = await requireRole(['teacher', 'admin', 'student'])

  const meetLinkId = formData.get('meetLinkId') as string
  const content = formData.get('content') as string

  if (!meetLinkId || !content?.trim()) {
    throw new Error('Missing comment details')
  }

  await createMeetComment(meetLinkId, me.id, content.trim())
  revalidatePath('/meetings')
}
