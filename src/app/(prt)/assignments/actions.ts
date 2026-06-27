'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createComment } from '@/lib/repos/comments'

export async function addCommentAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const submission_id = String(formData.get('submission_id') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()
  if (!submission_id || !content) return
  await createComment(submission_id, me.id, content)
  revalidatePath('/assignments')
  revalidatePath(`/assignments/${String(formData.get('assignment_id') ?? '')}`)
}
