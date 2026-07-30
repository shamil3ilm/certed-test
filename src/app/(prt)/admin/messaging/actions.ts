'use server'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth/require-role'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { saveMessagingMatrix } from '@/lib/services/messaging/matrix-config'

/** Admin-tier only (manageUsers): persist the messaging matrix. The submitted
 *  `pair` values are the enabled canonical keys; the service sanitises them. */
export async function saveMessagingMatrixAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('manageUsers')
  try {
    await saveMessagingMatrix(
      me,
      formData.getAll('pair').map((v) => String(v)),
    )
    revalidatePath('/admin/messaging')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}
