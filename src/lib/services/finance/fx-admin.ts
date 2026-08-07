import 'server-only'
import { z } from 'zod'
import { requireActorCapability } from '@/lib/services/authorization'
import { ValidationError } from '@/lib/errors'
import { SUPPORTED_CURRENCIES } from '@/lib/money'
import {
  deleteExchangeRate,
  selectExchangeRates,
  upsertExchangeRate,
  type ExchangeRateRow,
} from '@/lib/data/exchange-rates'
import { selectUnconvertedCurrencies } from '@/lib/data/finance-fx'
import { selectOrgSettings, updateBaseCurrency } from '@/lib/data/org-settings'
import { recomputeConversions, type RecomputeResult } from './fx-conversion'

/**
 * Admin rate management: maintain the effective-dated rates, set the base
 * currency, and re-price documents. Every mutation is admin-gated and followed by
 * a recompute so the dashboard rollups reflect the change immediately.
 */

const FX_DENIED = 'Only an admin can manage currency conversion.'

const currencySchema = z.string().refine((c) => (SUPPORTED_CURRENCIES as readonly string[]).includes(c), {
  message: 'Choose a supported currency.',
})

export const exchangeRateSchema = z.object({
  currency: currencySchema,
  rate: z.coerce.number().positive().finite(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.'),
  note: z.string().trim().max(200).nullable().optional(),
})
export type ExchangeRateInput = z.infer<typeof exchangeRateSchema>

export type FxRatesPageData = {
  baseCurrency: string
  rates: ExchangeRateRow[]
  /** Currencies used by non-void documents that still lack a rate (base excluded). */
  needingRate: string[]
  currencies: readonly string[]
}

export async function loadFxRatesPageData(actorId: string): Promise<FxRatesPageData> {
  await requireActorCapability(actorId, 'manageAdminTier', FX_DENIED)
  const [org, rates, unconverted] = await Promise.all([
    selectOrgSettings(),
    selectExchangeRates(),
    selectUnconvertedCurrencies(),
  ])
  return {
    baseCurrency: org.base_currency,
    rates,
    needingRate: unconverted.filter((c) => c !== org.base_currency),
    currencies: SUPPORTED_CURRENCIES,
  }
}

export async function addExchangeRate(actorId: string, input: unknown): Promise<void> {
  await requireActorCapability(actorId, 'manageAdminTier', FX_DENIED)
  const parsed = exchangeRateSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Enter a supported currency, a positive rate, and a valid date.')
  }
  const org = await selectOrgSettings()
  if (parsed.data.currency === org.base_currency) {
    throw new ValidationError('The base currency needs no rate - it converts one to one.')
  }
  await upsertExchangeRate({
    currency: parsed.data.currency,
    base_currency: org.base_currency,
    rate: parsed.data.rate,
    effective_from: parsed.data.effective_from,
    note: parsed.data.note ?? null,
    created_by: actorId,
  })
  await recomputeConversions(actorId)
}

export async function removeExchangeRate(actorId: string, id: string): Promise<void> {
  await requireActorCapability(actorId, 'manageAdminTier', FX_DENIED)
  if (!id) throw new ValidationError('No rate selected.')
  await deleteExchangeRate(id)
  await recomputeConversions(actorId)
}

export async function setBaseCurrency(actorId: string, currency: unknown): Promise<void> {
  await requireActorCapability(actorId, 'manageAdminTier', FX_DENIED)
  const parsed = currencySchema.safeParse(currency)
  if (!parsed.success) throw new ValidationError('Choose a supported currency.')
  await updateBaseCurrency(parsed.data)
  // Every document re-bases to the new currency; anything without a rate to it
  // becomes unconverted and shows up on the to-do list.
  await recomputeConversions(actorId)
}

export async function recomputeFx(actorId: string): Promise<RecomputeResult> {
  return recomputeConversions(actorId)
}
