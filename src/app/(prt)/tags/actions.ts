'use server'
import { revalidatePath } from 'next/cache'
import { requireActiveProfile } from '@/lib/auth/require-role'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { applyTagByName, untagEntity, type TaggableType } from '@/lib/services/tags'

/** Create-or-get a tag by name and attach it. The service gates it on the
 *  caller's permission for the entity, so no capability check is needed here. */
export async function addTagAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireActiveProfile()
  const type = String(formData.get('type') ?? '') as TaggableType
  const entityId = String(formData.get('entity_id') ?? '')
  try {
    await applyTagByName(me, type, entityId, String(formData.get('name') ?? ''))
    revalidatePath('/(prt)/classroom', 'layout')
    return actionDone()
  } catch (e) {
    return toActionError(e)
  }
}

export async function removeTagAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireActiveProfile()
  const type = String(formData.get('type') ?? '') as TaggableType
  const entityId = String(formData.get('entity_id') ?? '')
  try {
    await untagEntity(me, type, entityId, String(formData.get('tag_id') ?? ''))
    revalidatePath('/(prt)/classroom', 'layout')
    return actionDone()
  } catch (e) {
    return toActionError(e)
  }
}
