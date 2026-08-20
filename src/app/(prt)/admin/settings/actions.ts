'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/require-role'
import { actionOk, toActionError, type ActionResult } from '@/lib/api/action-error'
import { revalidateOrgSettings } from '@/lib/services/finance/org-settings'
import { saveOrgProfile, validateOrgProfileInput } from '@/lib/services/org-settings'

const FIELDS = [
  'institute_name',
  'contact_email',
  'contact_phone',
  'bank_account',
  'bank_ifsc',
  'bank_branch',
  'terms_text',
  'signatory_name',
  'signatory_title',
  'signature_text',
  'receipt_prefix',
  'payslip_prefix',
] as const

/** Saves the academy's institute-profile settings. Admin-persona ONLY: these are the
 *  sensitive bank/IFSC/signatory fields the DB restricts to is_active_admin() (0017),
 *  and this write goes through the service-role client (bypassing RLS), so the app gate
 *  MUST match the DB policy - manageUsers (which sub_admin also holds) would let a
 *  sub_admin rewrite the institute bank details that print on student receipts. A
 *  structural admin-only rule, deliberately NOT capability/override-grantable.
 *  Validation + audit happen in the service. Busts the org-settings cache so the new
 *  letterhead shows on the next PDF/render immediately. */
export async function saveOrgProfileAction(formData: FormData): Promise<ActionResult<{ ok: true }>> {
  const me = await requireRole(['admin'])
  try {
    const raw = Object.fromEntries(FIELDS.map((field) => [field, String(formData.get(field) ?? '')]))
    await saveOrgProfile(me, validateOrgProfileInput(raw))
    revalidateOrgSettings()
    revalidatePath('/admin/settings')
    return actionOk({ ok: true })
  } catch (e) {
    return toActionError(e)
  }
}
