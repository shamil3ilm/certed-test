'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createMeetLink, deleteMeetLink, getMeetLink } from '@/lib/repos/meetLinks'
import { canManageScope } from '@/lib/repos/classes'
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

  // A class meet requires managing that class; a global meet (null) is admin-only.
  if (!(await canManageScope(me, classId))) {
    throw new Error('Not allowed to post a meet link to this class')
  }

  const { title, url, description } = parsed.data
  await createMeetLink({
    class_id: classId || null,
    title,
    url,
    description,
    created_by: me.id,
  })

  revalidatePath('/classroom', 'layout')
}

export async function deleteMeetLinkAction(id: string) {
  const me = await requireRole(['teacher', 'admin'])
  const link = await getMeetLink(id)
  if (!link) return
  if (!(await canManageScope(me, link.class_id))) return
  await deleteMeetLink(id)
  revalidatePath('/classroom', 'layout')
}
