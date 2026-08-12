'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth/require-role'
import { isAdminTier } from '@/lib/capabilities'
import { actionOk, actionFail, toActionError, type ActionResult } from '@/lib/api/action-error'
import { rateLimit } from '@/lib/security/rate-limit'
import { addExchangeRate, removeExchangeRate, setBaseCurrency, recomputeFx } from '@/lib/services/finance/fx-admin'
import { revalidateOrgSettings } from '@/lib/services/finance/org-settings'

const RATES_PATH = '/admin/finance/rates'

/** Establishes the actor and confirms admin tier (the authoritative check is in
 *  each service call, but bouncing early keeps a non-admin off the mutation). */
async function requireFxAdmin() {
  const me = await requireCapability('viewFinance')
  if (!isAdminTier(me)) return null
  return me
}

export async function addRateAction(formData: FormData): Promise<ActionResult<null>> {
  const me = await requireFxAdmin()
  if (!me) return actionFail('Only an admin can manage currency conversion.')
  if (!rateLimit(`fx-rate:${me.id}`, { limit: 20, windowMs: 60_000 }).ok) {
    return actionFail('Too many changes. Please wait a moment.')
  }
  try {
    await addExchangeRate(me.id, {
      currency: formData.get('currency'),
      rate: formData.get('rate'),
      effective_from: formData.get('effective_from'),
      note: (formData.get('note') as string) || null,
    })
    revalidatePath(RATES_PATH)
    revalidatePath('/dashboard')
    return actionOk(null)
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteRateAction(id: string): Promise<ActionResult<null>> {
  const me = await requireFxAdmin()
  if (!me) return actionFail('Only an admin can manage currency conversion.')
  try {
    await removeExchangeRate(me.id, id)
    revalidatePath(RATES_PATH)
    revalidatePath('/dashboard')
    return actionOk(null)
  } catch (error) {
    return toActionError(error)
  }
}

export async function setBaseCurrencyAction(currency: string): Promise<ActionResult<null>> {
  const me = await requireFxAdmin()
  if (!me) return actionFail('Only an admin can manage currency conversion.')
  try {
    await setBaseCurrency(me.id, currency)
    revalidateOrgSettings()
    revalidatePath(RATES_PATH)
    revalidatePath('/dashboard')
    return actionOk(null)
  } catch (error) {
    return toActionError(error)
  }
}

export async function recomputeAction(): Promise<ActionResult<{ converted: number; unconverted: number }>> {
  const me = await requireFxAdmin()
  if (!me) return actionFail('Only an admin can manage currency conversion.')
  try {
    const result = await recomputeFx(me.id)
    revalidatePath(RATES_PATH)
    revalidatePath('/dashboard')
    return actionOk(result)
  } catch (error) {
    return toActionError(error)
  }
}
