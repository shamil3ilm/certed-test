'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { createComment, type CommentEntity } from '@/lib/repos/comments'

const VALID: CommentEntity[] = ['submission', 'resource', 'meet']

/** Post a comment on any commentable entity. RLS enforces the actual access rule. */
export async function addCommentAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const entityType = String(formData.get('entity_type') ?? '') as CommentEntity
  const entityId = String(formData.get('entity_id') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()
  if (!VALID.includes(entityType) || !entityId || !content) return
  await createComment(entityType, entityId, me.id, content)
  revalidatePath('/classroom', 'layout')
  revalidatePath('/assignments', 'layout')
}
