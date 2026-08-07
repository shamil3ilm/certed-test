import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { KIND } from './finance-docs-shared'
import type { FinanceKind } from './finance-docs'

/**
 * Reads and writes for a document's base-currency overlay (base_currency,
 * base_total, fx_rate, fx_rate_id). Service-role: the overlay is a reporting
 * projection an admin recomputes, distinct from the immutable document body, so
 * it is written directly rather than through the atomic issuance path.
 */

export type ConvertibleDoc = { id: string; currency: string; issue_date: string; total: number }

/** Non-void documents of a kind, with the fields needed to price them into base. */
export async function selectConvertibleDocs(kind: FinanceKind): Promise<ConvertibleDoc[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(KIND[kind].table)
    .select('id, currency, issue_date, total')
    .eq('voided', false)
  if (error) throw new Error(`${kind}.convertible: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    currency: r.currency as string,
    issue_date: r.issue_date as string,
    total: Number(r.total),
  }))
}

/** One non-void document by id, or null (voided/missing), for issue-time conversion. */
export async function selectConvertibleDoc(kind: FinanceKind, id: string): Promise<ConvertibleDoc | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(KIND[kind].table)
    .select('id, currency, issue_date, total')
    .eq('id', id)
    .eq('voided', false)
    .maybeSingle()
  if (error) throw new Error(`${kind}.convertibleOne: ${error.message}`)
  if (!data) return null
  const r = data as Record<string, unknown>
  return {
    id: r.id as string,
    currency: r.currency as string,
    issue_date: r.issue_date as string,
    total: Number(r.total),
  }
}

/** Distinct currencies of non-void documents still lacking a base amount - the
 *  admin's "add a rate for these" to-do list. */
export async function selectUnconvertedCurrencies(): Promise<string[]> {
  const admin = createAdminClient()
  const out = new Set<string>()
  for (const kind of ['receipt', 'payslip'] as FinanceKind[]) {
    const { data, error } = await admin
      .from(KIND[kind].table)
      .select('currency')
      .eq('voided', false)
      .is('base_total', null)
    if (error) throw new Error(`${kind}.unconvertedCurrencies: ${error.message}`)
    for (const r of (data ?? []) as Record<string, unknown>[]) out.add(r.currency as string)
  }
  return [...out]
}

export type DocConversion = {
  base_currency: string
  base_total: number | null
  fx_rate: number | null
  fx_rate_id: string | null
}

export async function updateDocConversion(kind: FinanceKind, id: string, conv: DocConversion): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from(KIND[kind].table).update(conv).eq('id', id)
  if (error) throw new Error(`${kind}.updateConversion: ${error.message}`)
}
