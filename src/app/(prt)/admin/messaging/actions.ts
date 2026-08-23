'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/require-role'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { saveMessagingMatrix } from '@/lib/services/messaging/matrix-config'
import { revalidateOrgSettings } from '@/lib/services/finance/org-settings'

/** ADMIN persona only: persist the academy-wide messaging matrix. It writes org_settings,
 *  which the DB restricts to admins (is_active_admin) - matching the bank-fields fix, so a
 *  sub_admin can't set academy DM policy via the service-role path. The submitted `pair`
 *  values are the enabled canonical keys; the service sanitises them. */
export async function saveMessagingMatrixAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireRole(['admin'])
  try {
    await saveMessagingMatrix(
      me,
      formData.getAll('pair').map((v) => String(v)),
    )
    revalidateOrgSettings()
    revalidatePath('/admin/messaging')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}
