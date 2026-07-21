'use server'
import { revalidatePath } from 'next/cache'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { requireCapability } from '@/lib/auth/require-role'
import { createCommentFromActionInput } from '@/lib/services/comments'

/** Post a comment on any commentable entity. viewClasses = class participants
 *  (admin/tutor/student); RLS enforces the actual per-entity access rule. */
export async function addCommentAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('viewClasses')
  try {
    await createCommentFromActionInput(me.id, {
      entity_type: formData.get('entity_type'),
      entity_id: formData.get('entity_id'),
      content: formData.get('content'),
    })
    revalidatePath('/classroom', 'layout')
    revalidatePath('/assignments', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}
