import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/data/paginate'
import type { ExchangeRate } from '@/lib/finance/fx'

/**
 * Table access for `exchange_rates` - the effective-dated rates an admin
 * maintains. Service-role: the recompute and the rollups read these for every
 * document regardless of caller, and the RLS policy (admin-only) stays as the
 * guard against direct PostgREST access. Callers are admin-gated at the service
 * layer.
 */

export type ExchangeRateRow = ExchangeRate & { note: string | null; created_at: string }

/**
 * EVERY rate, oldest currency first and newest effective date first within each.
 *
 * Paged rather than a bare select. The table is effective-DATED - one row per currency pair
 * per date a rate changed - so it accumulates for as long as the academy operates, and a
 * bare select is silently truncated at the PostgREST row cap. The caller re-prices documents
 * from this set, so a truncated read does not shorten a list, it prices the back catalogue
 * off a rate table with the older entries missing.
 *
 * `id` makes the order TOTAL. Currency + effective_from does not: two rows tie whenever the
 * same currency has rates against different bases on one date, and an offset walk over a
 * non-total order duplicates some rows and skips others.
 */
export async function selectExchangeRates(): Promise<ExchangeRateRow[]> {
  const admin = createAdminClient()
  const data = await fetchAllPaged<Record<string, unknown>>(
    (from, to) =>
      admin
        .from('exchange_rates')
        .select('id, currency, base_currency, rate, effective_from, note, created_at')
        .order('currency', { ascending: true })
        .order('effective_from', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    'exchange_rates.select',
  )
  return data.map((r) => ({
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
