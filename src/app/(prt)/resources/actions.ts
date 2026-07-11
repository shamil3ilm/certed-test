'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createLinkResource } from '@/lib/repos/resources'
import { linkUrl } from '@/lib/validation/url'
import { z } from 'zod'

const linkResourceSchema = z.object({
  classId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  url: linkUrl,
})

export async function createLinkResourceAction(formData: FormData) {
  const me = await requireRole(['teacher', 'admin'])

  const parsed = linkResourceSchema.safeParse({
    classId: formData.get('classId'),
    title: formData.get('title'),
    url: formData.get('url'),
  })

  if (!parsed.success) {
    throw new Error('Invalid input data')
  }

  const { classId, title, url } = parsed.data
  await createLinkResource({
    class_id: classId,
    title,
    drive_link: url,
    uploaded_by: me.id,
  })

  revalidatePath('/resources')
  revalidatePath('/classroom', 'layout')
}
