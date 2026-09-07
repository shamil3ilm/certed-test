import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { escapeOrIlike } from '@/lib/text/ilike'
import { fetchAllPaged } from '@/lib/data/paginate'
import type { Page } from '@/lib/pagination'
import type { FinanceDoc, FinanceKind, FinanceLine } from './finance-docs'
import { docColumns, KIND, toDoc, type FinanceTotal } from './finance-docs-shared'

/**
 * ONE page of a party's OWN documents, newest first, with the exact total.
 *
 * Deliberately on the RLS client, not the service role. The admin ledger's selectDocPage is
 * service-role because it must read every party; this is the self-service page, where the
 * caller may only ever see their own - so RLS stays the gate and `partyId` is a narrowing
 * filter rather than the security boundary. Routing the self-service list through the
 * admin-ledger query would have moved that boundary into application code, where a future
 * caller passing someone else's id is a leak the database no longer catches.
 */
export async function selectDocPageForParty(
  kind: FinanceKind,
  partyId: string,
  range: { from: number; to: number },
): Promise<Page<FinanceDoc>> {
  const k = KIND[kind]
  const supabase = await createClient()
  const { data, error, count } = await supabase
    .from(k.table)
    .select(docColumns(k), { count: 'exact' })
    .eq(k.partyCol, partyId)
    .order('created_at', { ascending: false })
    // created_at ties (two documents issued in one run) are otherwise ordered arbitrarily,
    // and an unstable order under paging can repeat or skip a row.
    .order('id', { ascending: true })
    .range(range.from, range.to)
  if (error) throw new Error(`${kind}.listMinePage: ${error.message}`)
  return {
    items: ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => toDoc(kind, row)),
    total: count ?? 0,
  }
}

export async function selectAllDocs(kind: FinanceKind): Promise<FinanceDoc[]> {
  const k = KIND[kind]
  const supabase = createAdminClient()
  // The CSV export treats this as the COMPLETE ledger, so it must not stop at the
  // PostgREST row cap - page through every row (see fetchAllPaged).
  const rows = await fetchAllPaged(
    (from, to) =>
      supabase
        .from(k.table)
        .select(docColumns(k))
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
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
): Promise<Page<FinanceDoc>> {
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
  const { data, error, count } = await query.order('id', { ascending: true }).range(opts.from, opts.to)
  if (error) throw new Error(`${kind}.listPage: ${error.message}`)
  return {
    items: ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => toDoc(kind, row)),
    total: count ?? 0,
  }
}

/**
 * Every document of ONE party, reduced to the three fields its totals need.
 *
 * The stat cards are per-currency sums over the WHOLE set, so they cannot be computed from
 * a page - and a sum that silently omits rows past the PostgREST cap is worse than no sum
 * at all. fetchAllPaged exists for exactly this: a read that must be complete to be
 * correct. Only three narrow columns travel, and the set is one person's monthly documents.
 */
export async function selectPartyDocTotals(
  kind: FinanceKind,
  partyId: string,
): Promise<{ total: number; currency: string; voided: boolean }[]> {
  const k = KIND[kind]
  // RLS client, matching selectDocPageForParty: the stat cards summarise exactly the list
  // beneath them, so both must be gated the same way or the totals could describe rows the
  // list is not allowed to show.
  const supabase = await createClient()
  const rows = await fetchAllPaged<{ total: number | string; currency: string; voided: boolean }>(
    (from, to) =>
      supabase
        .from(k.table)
        .select('total, currency, voided')
        .eq(k.partyCol, partyId)
        .order('id', { ascending: true })
        .range(from, to),
    `${kind}.partyTotals`,
  )
  // Postgres returns numeric as a STRING over PostgREST; left as-is, the per-currency sum
  // would concatenate instead of adding.
  return rows.map((r) => ({ total: Number(r.total), currency: r.currency, voided: r.voided }))
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

/**
 * A LIVE document of the same kind, party, currency and total issued since `sinceIso`.
 *
 * Guards the hand-typed issue path, which 0100's unique indexes deliberately do not cover:
 * they are partial on `billing_period is not null`, so a document that bills no particular
 * month stays valid and unconstrained - and that is the default the issue form sends. This
 * is a DOUBLE-SUBMIT guard, not a uniqueness rule: an academy may legitimately issue two
 * documents to the same party on the same day, so the window is deliberately short.
 */
export async function selectRecentLiveDuplicate(
  kind: FinanceKind,
  partyId: string,
  currency: string,
  total: number,
  sinceIso: string,
): Promise<{ number: string } | null> {
  const k = KIND[kind]
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(k.table)
    .select('number')
    .eq(k.partyCol, partyId)
    .eq('currency', currency)
    .eq('total', total)
    .eq('voided', false)
    .gte('created_at', sinceIso)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`${kind}.recentDuplicate: ${error.message}`)
  return (data as { number: string } | null) ?? null
}
