'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createMeetLink, deleteMeetLink } from '@/lib/services/meetLinks'
import { linkUrl } from '@/lib/validation/url'
import { z } from 'zod'

const meetLinkSchema = z.object({
  classId: z.string().uuid().nullable().or(z.literal('')),
  title: z.string().trim().min(1).max(200),
  url: linkUrl,
  description: z.string().trim().max(1000).optional(),
})

export async function createMeetLinkAction(formData: FormData) {
  const me = await requireRole(['teacher', 'admin'])

  const rawClassId = formData.get('classId')
  const classId = rawClassId === '' || rawClassId === 'global' ? null : (rawClassId as string)

  const parsed = meetLinkSchema.safeParse({
    classId,
    title: formData.get('title'),
    url: formData.get('url'),
    description: formData.get('description'),
  })

  if (!parsed.success) {
    throw new Error('Invalid meet link data: ' + parsed.error.message)
  }

  const { title, url, description } = parsed.data
  // Permission check + write + audit all happen inside the service.
  await createMeetLink(me, { class_id: classId, title, url, description })

  revalidatePath('/classroom', 'layout')
}

export async function deleteMeetLinkAction(id: string) {
  const me = await requireRole(['teacher', 'admin'])
  await deleteMeetLink(me, id)
  revalidatePath('/classroom', 'layout')
}
