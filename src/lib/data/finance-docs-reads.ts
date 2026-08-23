import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { escapeOrIlike } from '@/lib/text/ilike'
import { fetchAllPaged } from '@/lib/data/paginate'
import type { FinanceDoc, FinanceKind, FinanceLine } from './finance-docs'
import { docColumns, KIND, toDoc, type FinanceTotal } from './finance-docs-shared'

export async function selectDocsForParty(kind: FinanceKind, partyId: string): Promise<FinanceDoc[]> {
  const k = KIND[kind]
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(k.table)
    .select(docColumns(k))
    .eq(k.partyCol, partyId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`${kind}.listMine: ${error.message}`)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => toDoc(kind, row))
}

export async function selectAllDocs(kind: FinanceKind): Promise<FinanceDoc[]> {
  const k = KIND[kind]
  const supabase = createAdminClient()
  // The CSV export treats this as the COMPLETE ledger, so it must not stop at the
  // PostgREST row cap - page through every row (see fetchAllPaged).
  const rows = await fetchAllPaged(
    (from, to) =>
      supabase.from(k.table).select(docColumns(k)).order('created_at', { ascending: false }).range(from, to),
    `${kind}.listAll`,
  )
  return (rows as unknown as Record<string, unknown>[]).map((row) => toDoc(kind, row))
}

export async function selectRecentDocs(kind: FinanceKind, limit: number): Promise<FinanceDoc[]> {
  const k = KIND[kind]
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from(k.table)
    .select(docColumns(k))
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`${kind}.listRecent: ${error.message}`)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => toDoc(kind, row))
}

export async function selectDocPage(
  kind: FinanceKind,
  opts: { from: number; to: number; search?: string; status?: 'active' | 'voided' },
): Promise<{ rows: FinanceDoc[]; total: number }> {
  const k = KIND[kind]
  const supabase = createAdminClient()
  let query = supabase.from(k.table).select(docColumns(k), { count: 'exact' }).order('created_at', { ascending: false })
  if (opts.status === 'active') query = query.eq('voided', false)
  if (opts.status === 'voided') query = query.eq('voided', true)
  const search = opts.search?.trim()
  if (search) {
    const needle = escapeOrIlike(search)
    query = query.or(`number.ilike.%${needle}%,${k.nameCol}.ilike.%${needle}%`)
  }
  const { data, error, count } = await query.range(opts.from, opts.to)
  if (error) throw new Error(`${kind}.listPage: ${error.message}`)
  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => toDoc(kind, row)),
    total: count ?? 0,
  }
}

export async function callFinanceTotals(kind: FinanceKind): Promise<FinanceTotal[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('finance_totals', { p_kind: kind })
  if (error) throw new Error(`${kind}.totals: ${error.message}`)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    currency: row.currency as string,
    live_total: Number(row.live_total),
    live_count: Number(row.live_count),
  }))
}

export type FinanceBaseTotal = {
  base_currency: string
  base_total: number
  converted_count: number
  unconverted_count: number
}

/** Per-kind totals already converted into the academy base currency, plus how
 *  many non-void documents are still unconverted (so a rollup can flag rather
 *  than silently understate). */
export async function callFinanceTotalsBase(kind: FinanceKind): Promise<FinanceBaseTotal> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('finance_totals_base', { p_kind: kind })
  if (error) throw new Error(`${kind}.totalsBase: ${error.message}`)
  const row = (data ?? [])[0] as Record<string, unknown> | undefined
  return {
    base_currency: (row?.base_currency as string) ?? '',
    base_total: Number(row?.base_total ?? 0),
    converted_count: Number(row?.converted_count ?? 0),
    unconverted_count: Number(row?.unconverted_count ?? 0),
  }
}

export async function selectDocById(kind: FinanceKind, id: string): Promise<FinanceDoc | null> {
  const k = KIND[kind]
  const supabase = await createClient()
  const { data, error } = await supabase.from(k.table).select(docColumns(k)).eq('id', id).maybeSingle()
  if (error) throw new Error(`${kind}.getById: ${error.message}`)
  return data ? toDoc(kind, data as unknown as Record<string, unknown>) : null
}

export async function selectDocLines(kind: FinanceKind, id: string): Promise<FinanceLine[]> {
  const k = KIND[kind]
  const admin = createAdminClient()
  const { data, error } = await admin.from(k.lineTable).select(`${k.labelCol}, hours, rate, amount`).eq(k.fkCol, id)
  if (error) throw new Error(`${kind}.getLines: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    label: row[k.labelCol] as string,
    hours: Number(row.hours),
    rate: Number(row.rate),
    amount: Number(row.amount),
  }))
}
