'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth/require-role'
import { isAdminTier } from '@/lib/capabilities'
import { actionOk, actionFail, toActionError, type ActionResult } from '@/lib/api/action-error'
import { rateLimit } from '@/lib/security/rate-limit'
import { setBillingRate } from '@/lib/services/finance/billing-rates-admin'

const RATES_PATH = '/admin/finance/billing-rates'

/**
 * Set one person's hourly rate.
 *
 * Admin tier only, and NOT override-grantable - the same structural rule the rest of
 * finance write follows. viewFinance is a READ capability; an hourly rate decides what
 * every future document charges, so it stays with the tier that issues documents.
 */
export async function setBillingRateAction(formData: FormData): Promise<ActionResult<null>> {
  const me = await requireCapability('viewFinance')
  if (!isAdminTier(me)) return actionFail('Only an admin can set billing rates.')
  if (!rateLimit(`billing-rate:${me.id}`, { limit: 40, windowMs: 60_000 }).ok) {
    return actionFail('Too many changes. Please wait a moment.')
  }
  try {
    await setBillingRate(me.id, {
      profile_id: formData.get('profile_id'),
      side: formData.get('side'),
      rate: formData.get('rate'),
      currency: formData.get('currency'),
    })
    revalidatePath(RATES_PATH)
    return actionOk(null)
  } catch (error) {
    return toActionError(error)
  }
}
