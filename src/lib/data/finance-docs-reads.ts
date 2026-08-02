import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { escapeOrIlike } from '@/lib/text/ilike'
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
  const { data, error } = await supabase.from(k.table).select(docColumns(k)).order('created_at', { ascending: false })
  if (error) throw new Error(`${kind}.listAll: ${error.message}`)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => toDoc(kind, row))
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
