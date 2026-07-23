import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeIlike } from '@/lib/text/ilike'

/**
 * Table access for the two finance documents. Receipts and pay slips are
 * structurally identical - they differ only in table and column names - so the
 * storage shape lives in KIND and every function takes a `kind`. Rows are
 * normalized to one domain type (FinanceDoc) here, so nothing above this module
 * ever touches a raw column name.
 *
 * No authorization, like every other data module: the domain
 * (src/lib/services/finance/finance-docs) gates the mutations.
 */

const KIND = {
  receipt: {
    table: 'receipts',
    lineTable: 'receipt_lines',
    partyCol: 'student_id',
    nameCol: 'student_name_snapshot',
    labelCol: 'subject',
    fkCol: 'receipt_id',
    hasClass: true,
  },
  payslip: {
    table: 'payslips',
    lineTable: 'payslip_lines',
    partyCol: 'tutor_id',
    nameCol: 'tutor_name_snapshot',
    labelCol: 'label',
    fkCol: 'payslip_id',
    hasClass: false,
  },
} as const

export type FinanceKind = keyof typeof KIND

export type FinanceLine = { label: string; hours: number; rate: number; amount: number }

/** Normalized finance document (receipt or pay slip) - the same shape for both. */
export type FinanceDoc = {
  id: string
  number: string
  party_id: string | null
  party_name: string
  class_level: string | null // receipts only; null for pay slips
  issue_date: string
  currency: string
  note: string | null
  subtotal: number
  discount: number | null
  total: number
  voided: boolean
  created_by: string | null
  created_at: string
}

/** Fields needed to create a document (id/number/totals computed by the caller). */
export type NewFinanceDoc = {
  number: string
  party_id: string
  party_name: string
  class_level: string | null
  issue_date: string
  currency: string
  note: string | null
  subtotal: number
  discount: number | null
  total: number
  created_by: string | null
}

export type IssueFinanceDocInput = Omit<NewFinanceDoc, 'number'> & {
  prefix: string
  lines: FinanceLine[]
}

function toDoc(kind: FinanceKind, row: Record<string, unknown>): FinanceDoc {
  const k = KIND[kind]
  return {
    id: row.id as string,
    number: row.number as string,
    party_id: (row[k.partyCol] as string | null) ?? null,
    party_name: row[k.nameCol] as string,
    class_level: k.hasClass ? ((row.class_snapshot as string | null) ?? null) : null,
    issue_date: row.issue_date as string,
    currency: row.currency as string,
    note: (row.note as string | null) ?? null,
    subtotal: Number(row.subtotal),
    discount: row.discount == null ? null : Number(row.discount),
    total: Number(row.total),
    voided: Boolean(row.voided),
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
  }
}

/** A party's own documents (RLS-scoped), newest first. */
export async function selectDocsForParty(kind: FinanceKind, partyId: string): Promise<FinanceDoc[]> {
  const k = KIND[kind]
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(k.table)
    .select('*')
    .eq(k.partyCol, partyId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`${kind}.listMine: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => toDoc(kind, r))
}

/** Every document (RLS lets an admin read all), newest first. Unbounded - for
 *  the explicit CSV export only, never a page or dashboard read. */
export async function selectAllDocs(kind: FinanceKind): Promise<FinanceDoc[]> {
  const k = KIND[kind]
  const supabase = await createClient()
  const { data, error } = await supabase.from(k.table).select('*').order('created_at', { ascending: false })
  if (error) throw new Error(`${kind}.listAll: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => toDoc(kind, r))
}

/** The most recent documents, newest first - bounded, for ledger/preview views. */
export async function selectRecentDocs(kind: FinanceKind, limit: number): Promise<FinanceDoc[]> {
  const k = KIND[kind]
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(k.table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`${kind}.listRecent: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => toDoc(kind, r))
}

/** One page of the ledger with an exact total. Search matches the document
 *  number or the party's name-snapshot (their name at time of issue). */
export async function selectDocPage(
  kind: FinanceKind,
  opts: { from: number; to: number; search?: string; status?: 'active' | 'voided' },
): Promise<{ rows: FinanceDoc[]; total: number }> {
  const k = KIND[kind]
  const supabase = await createClient()
  let query = supabase.from(k.table).select('*', { count: 'exact' }).order('created_at', { ascending: false })
  if (opts.status === 'active') query = query.eq('voided', false)
  if (opts.status === 'voided') query = query.eq('voided', true)
  const search = opts.search?.trim()
  if (search) {
    const needle = escapeIlike(search)
    query = query.or(`number.ilike.%${needle}%,${k.nameCol}.ilike.%${needle}%`)
  }
  const { data, error, count } = await query.range(opts.from, opts.to)
  if (error) throw new Error(`${kind}.listPage: ${error.message}`)
  return { rows: ((data ?? []) as Record<string, unknown>[]).map((r) => toDoc(kind, r)), total: count ?? 0 }
}

export type FinanceTotal = { currency: string; live_total: number; live_count: number }

/** Per-currency, non-voided totals computed in SQL - no rows shipped to the app. */
export async function callFinanceTotals(kind: FinanceKind): Promise<FinanceTotal[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('finance_totals', { p_kind: kind })
  if (error) throw new Error(`${kind}.totals: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    currency: r.currency as string,
    live_total: Number(r.live_total),
    live_count: Number(r.live_count),
  }))
}

/** One document by id (RLS: own or admin). */
export async function selectDocById(kind: FinanceKind, id: string): Promise<FinanceDoc | null> {
  const k = KIND[kind]
  const supabase = await createClient()
  const { data } = await supabase.from(k.table).select('*').eq('id', id).maybeSingle()
  return data ? toDoc(kind, data as Record<string, unknown>) : null
}

/** Line items for a document. Service-role, because the lines tables have no
 *  policy of their own - the caller must already have proved access to the
 *  parent document. */
export async function selectDocLines(kind: FinanceKind, id: string): Promise<FinanceLine[]> {
  const k = KIND[kind]
  const admin = createAdminClient()
  const { data } = await admin.from(k.lineTable).select(`${k.labelCol}, hours, rate, amount`).eq(k.fkCol, id)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    label: r[k.labelCol] as string,
    hours: Number(r.hours),
    rate: Number(r.rate),
    amount: Number(r.amount),
  }))
}

/** Issues a document atomically inside the database - number allocation and
 *  line insertion included, so a failure can't leave a numbered document with
 *  no lines. */
export async function callIssueDoc(kind: FinanceKind, doc: IssueFinanceDocInput): Promise<FinanceDoc> {
  const admin = createAdminClient()
  const fn = kind === 'receipt' ? 'issue_receipt_doc' : 'issue_payslip_doc'
  const { data, error } = await admin.rpc(fn, {
    p_party_id: doc.party_id,
    p_party_name: doc.party_name,
    p_class_level: doc.class_level,
    p_issue_date: doc.issue_date,
    p_currency: doc.currency,
    p_note: doc.note,
    p_subtotal: doc.subtotal,
    p_discount: doc.discount,
    p_total: doc.total,
    p_created_by: doc.created_by,
    p_prefix: doc.prefix,
    p_lines: doc.lines,
  })
  if (error) throw new Error(`${kind}.issue: ${error.message}`)
  return toDoc(kind, data as Record<string, unknown>)
}

/**
 * Marks a document void. Returns false when no LIVE document with that id
 * existed - the `voided = false` filter both prevents re-voiding and lets the
 * caller tell a real void from a no-op, so an unknown or already-voided id can
 * 404 instead of reporting a phantom success.
 */
export async function updateDocVoided(kind: FinanceKind, id: string): Promise<boolean> {
  const k = KIND[kind]
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(k.table)
    .update({ voided: true })
    .eq('id', id)
    .eq('voided', false)
    .select('id')
  if (error) throw new Error(`${kind}.void: ${error.message}`)
  return (data?.length ?? 0) > 0
}

/** Allocates the next sequential document number for a type and year, atomically
 *  via the `next_document_number` Postgres function. Returns the raw counter;
 *  formatting it into e.g. CEA-R-2026-0007 is the domain's job. */
export async function callNextDocumentNumber(docType: FinanceKind, year: number): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('next_document_number', {
    p_doc_type: docType,
    p_year: year,
  })
  if (error) throw new Error(`counters.allocate: ${error.message}`)
  return data as number
}
