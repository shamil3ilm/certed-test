'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createComment } from '@/lib/services/comments'
import { addCommentSchema } from '@/lib/validation/comment'

/** Post a comment on any commentable entity. RLS enforces the actual access rule. */
export async function addCommentAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const parsed = addCommentSchema.safeParse({
    entity_type: formData.get('entity_type'),
    entity_id: formData.get('entity_id'),
    content: formData.get('content'),
  })
  if (!parsed.success) return
  await createComment(parsed.data.entity_type, parsed.data.entity_id, me.id, parsed.data.content)
  revalidatePath('/classroom', 'layout')
  revalidatePath('/assignments', 'layout')
}
