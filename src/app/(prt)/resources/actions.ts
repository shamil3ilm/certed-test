'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createLinkResource } from '@/lib/services/resources'
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

  // Permission check + write + audit all happen inside the service — this
  // action can't reach the insert without going through them.
  await createLinkResource(me, {
    class_id: parsed.data.classId,
    title: parsed.data.title,
    drive_link: parsed.data.url,
  })

  revalidatePath('/resources')
  revalidatePath('/classroom', 'layout')
}
