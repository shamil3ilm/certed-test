import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ExchangeRate } from '@/lib/finance/fx'

/**
 * Table access for `exchange_rates` - the effective-dated rates an admin
 * maintains. Service-role: the recompute and the rollups read these for every
 * document regardless of caller, and the RLS policy (admin-only) stays as the
 * guard against direct PostgREST access. Callers are admin-gated at the service
 * layer.
 */

export type ExchangeRateRow = ExchangeRate & { note: string | null; created_at: string }

export async function selectExchangeRates(): Promise<ExchangeRateRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('exchange_rates')
    .select('id, currency, base_currency, rate, effective_from, note, created_at')
    .order('currency', { ascending: true })
    .order('effective_from', { ascending: false })
  if (error) throw new Error(`exchange_rates.select: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    currency: r.currency as string,
    base_currency: r.base_currency as string,
    rate: Number(r.rate),
    effective_from: r.effective_from as string,
    note: (r.note as string | null) ?? null,
    created_at: r.created_at as string,
  }))
}

export type NewExchangeRate = {
  currency: string
  base_currency: string
  rate: number
  effective_from: string
  note: string | null
  created_by: string
}

/** Adds a rate, or corrects the one already stored for the same
 *  currency/base/effective_from (the table's unique key). */
export async function upsertExchangeRate(input: NewExchangeRate): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('exchange_rates')
    .upsert(input, { onConflict: 'currency,base_currency,effective_from' })
  if (error) throw new Error(`exchange_rates.upsert: ${error.message}`)
}

export async function deleteExchangeRate(id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('exchange_rates').delete().eq('id', id)
  if (error) throw new Error(`exchange_rates.delete: ${error.message}`)
}
