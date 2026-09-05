import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/data/paginate'
import type { FinanceKind } from '@/lib/data/finance-docs'
import { KIND } from '@/lib/data/finance-docs-shared'

/**
 * Reads and writes for `billing_rates` (0095) - the per-person hourly rates that turn
 * recorded class hours into receipt and pay-slip lines.
 *
 * These run under the service role, like every other finance read. The table's RLS is
 * admin-tier only, so the SERVICE decides who may call these; nothing here is reachable
 * from a browser session. A rate is money data: never widen a caller to a non-admin tier
 * without moving the gate too.
 */

export interface BillingRate {
  profile_id: string
  /** What this person PAYS per hour as a student. Null = not set; the draft builder
   *  reports that as a blocking reason rather than billing zero. */
  fee_rate: number | null
  /** What this person EARNS per hour as a tutor or mentor. Same null semantics. */
  pay_rate: number | null
  currency: string
}

interface RateRow {
  profile_id: string
  fee_rate: string | number | null
  pay_rate: string | number | null
  currency: string
}

/** numeric(16,3) arrives as a STRING from PostgREST; Number(null) is 0, which would
 *  silently become a zero rate, so the null has to survive the conversion. */
function toRate(value: string | number | null): number | null {
  return value == null ? null : Number(value)
}

function toBillingRate(row: RateRow): BillingRate {
  return {
    profile_id: row.profile_id,
    fee_rate: toRate(row.fee_rate),
    pay_rate: toRate(row.pay_rate),
    currency: row.currency,
  }
}

const COLUMNS = 'profile_id, fee_rate, pay_rate, currency'

/** Rates for the given people, keyed by profile id. People with no row are simply absent
 *  from the map - "no rate set" is a normal state, not an error. Empty in, empty out. */
export async function selectBillingRatesFor(profileIds: string[]): Promise<Map<string, BillingRate>> {
  if (profileIds.length === 0) return new Map()
  const admin = createAdminClient()
  const rows = await fetchAllPaged<RateRow>(
    (from, to) => admin.from('billing_rates').select(COLUMNS).in('profile_id', profileIds).range(from, to),
    'billingRates.selectFor',
  )
  return new Map(rows.map((row) => [row.profile_id, toBillingRate(row)]))
}

/** Every stored rate - the admin maintenance screen. */
export async function selectAllBillingRates(): Promise<BillingRate[]> {
  const admin = createAdminClient()
  const rows = await fetchAllPaged<RateRow>(
    (from, to) => admin.from('billing_rates').select(COLUMNS).range(from, to),
    'billingRates.selectAll',
  )
  return rows.map(toBillingRate)
}

export interface BillingRateWrite {
  profile_id: string
  fee_rate: number | null
  pay_rate: number | null
  currency: string
  updated_by: string
}

/** Upsert one person's rates. `profile_id` is the primary key, so re-saving replaces
 *  rather than accumulating. */
export async function upsertBillingRate(input: BillingRateWrite): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('billing_rates')
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
  if (error) throw new Error(`billingRates.upsert: ${error.message}`)
}

/**
 * The parties who ALREADY hold a live (non-voided) document of this kind for `period`.
 *
 * This is the duplicate-issue warning's evidence. Voided documents are excluded on
 * purpose: re-issuing after a void is the normal correction path, and a voided document
 * suppressing the warning for its own replacement would be exactly backwards.
 */
export async function selectPartiesWithDocForPeriod(kind: FinanceKind, period: string): Promise<Set<string>> {
  const k = KIND[kind]
  const admin = createAdminClient()
  const rows = await fetchAllPaged<Record<string, string | null>>(
    (from, to) =>
      admin.from(k.table).select(k.partyCol).eq('billing_period', period).eq('voided', false).range(from, to),
    'billingRates.selectPartiesWithDocForPeriod',
  )
  const parties = new Set<string>()
  for (const row of rows) {
    const id = row[k.partyCol]
    if (id) parties.add(id)
  }
  return parties
}
