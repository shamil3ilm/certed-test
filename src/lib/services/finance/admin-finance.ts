import { formatMoney } from '@/lib/money'
import { parsePageParam, totalPages } from '@/lib/pagination'
import { requireActorCapability } from '@/lib/services/authorization'
import { listActiveByRole, listActiveMentorCandidates } from '@/lib/services/users'
import { FINANCE_DENIED, listDocsPage, type FinanceDoc } from '@/lib/services/finance/finance-docs'

const PAGE_SIZE = 20
/** The receipt party typeahead returns at most this many matches per query, and
 *  only searches once the term is long enough to be selective. */
const PARTY_SEARCH_LIMIT = 10
const PARTY_SEARCH_MIN_CHARS = 2

export type FinanceStatus = 'active' | 'voided'
export type FinanceFilters = { page: number; q?: string; status?: FinanceStatus }
export type FinancePageKind = 'receipts' | 'payslips'
export type FinancePageParty = { id: string; name: string }
export type FinancePageRow = {
  id: string
  number: string
  name: string
  totalLabel: string
  /** The total in the academy base currency ("≈ ₹8,200"), when the document is in
   *  a different currency and has been converted; null otherwise. */
  baseLabel: string | null
  voided: boolean
}

export type FinanceLedgerView = {
  title: string
  kind: FinancePageKind
  page: number
  total: number
  totalPages: number
  rows: FinancePageRow[]
  filters: FinanceFilters
  other: FinanceFilters
}

export type AdminFinancePageData = {
  tutors: FinancePageParty[]
  receipts: FinanceLedgerView
  payslips: FinanceLedgerView
}

/**
 * Typeahead source for the receipt IssueForm's student picker.
 *
 * Gated on manageAdminTier - the SAME hard-rule capability the finance mutations
 * use (finance-docs.ts), NOT viewFinance. viewFinance is override-grantable, so
 * gating the roster search on it would let an override-granted viewer enumerate
 * the active-student PII list that the issue API (requireRoleApi(['admin']))
 * refuses. Bounded by PARTY_SEARCH_LIMIT and a minimum term length so a crafted
 * call can neither dump the whole roster nor probe it one blank query at a time.
 */
export async function searchFinanceStudents(actorId: string, search: string): Promise<FinancePageParty[]> {
  await requireActorCapability(actorId, 'manageAdminTier', FINANCE_DENIED)
  const term = search.trim()
  if (term.length < PARTY_SEARCH_MIN_CHARS) return []
  return listActiveByRole('student', { search: term, limit: PARTY_SEARCH_LIMIT })
}

function parseStatus(v?: string): FinanceStatus | undefined {
  return v === 'active' || v === 'voided' ? v : undefined
}

function toFilters(searchParams: {
  rPage?: string
  rq?: string
  rstatus?: string
  pPage?: string
  pq?: string
  pstatus?: string
}): { receiptFilters: FinanceFilters; payslipFilters: FinanceFilters } {
  return {
    receiptFilters: {
      page: parsePageParam(searchParams.rPage),
      q: searchParams.rq?.trim() || undefined,
      status: parseStatus(searchParams.rstatus),
    },
    payslipFilters: {
      page: parsePageParam(searchParams.pPage),
      q: searchParams.pq?.trim() || undefined,
      status: parseStatus(searchParams.pstatus),
    },
  }
}

function toRows(items: FinanceDoc[]): FinancePageRow[] {
  return items.map((d) => ({
    id: d.id,
    number: d.number,
    name: d.party_name,
    totalLabel: formatMoney(d.total, d.currency),
    baseLabel:
      d.base_total != null && d.base_currency && d.base_currency !== d.currency
        ? `≈ ${formatMoney(d.base_total, d.base_currency)}`
        : null,
    voided: d.voided,
  }))
}

function toLedgerView(
  title: string,
  kind: FinancePageKind,
  page: { items: FinanceDoc[]; total: number },
  filters: FinanceFilters,
  other: FinanceFilters,
): FinanceLedgerView {
  return {
    title,
    kind,
    page: filters.page,
    total: page.total,
    totalPages: totalPages(page.total, PAGE_SIZE),
    rows: toRows(page.items),
    filters,
    other,
  }
}

/** Builds an /admin/finance URL, carrying the sibling ledger's filters too. */
export function financeUrl(kind: FinancePageKind, filters: FinanceFilters, other: FinanceFilters): string {
  const sp = new URLSearchParams()
  const prefix = kind === 'receipts' ? 'r' : 'p'
  const otherPrefix = kind === 'receipts' ? 'p' : 'r'
  if (filters.page > 1) sp.set(`${prefix}Page`, String(filters.page))
  if (filters.q) sp.set(`${prefix}q`, filters.q)
  if (filters.status) sp.set(`${prefix}status`, filters.status)
  if (other.page > 1) sp.set(`${otherPrefix}Page`, String(other.page))
  if (other.q) sp.set(`${otherPrefix}q`, other.q)
  if (other.status) sp.set(`${otherPrefix}status`, other.status)
  return `/admin/finance?${sp.toString()}#${kind}`
}

export async function loadAdminFinancePageData(searchParams: {
  rPage?: string
  rq?: string
  rstatus?: string
  pPage?: string
  pq?: string
  pstatus?: string
  canManage?: boolean
}): Promise<AdminFinancePageData> {
  const { receiptFilters, payslipFilters } = toFilters(searchParams)
  const canManage = Boolean(searchParams.canManage)
  // Students are NOT eagerly loaded: the receipt picker searches on demand via
  // searchFinanceStudents, so the page never ships the whole active-student
  // roster. Pay-slip payees (tutors + dedicated mentors) stay eager - that list
  // is the small staff roster, not the student body.
  const [tutors, receiptsPage, payslipsPage] = await Promise.all([
    canManage ? listActiveMentorCandidates() : Promise.resolve([]),
    listDocsPage('receipt', {
      page: receiptFilters.page,
      pageSize: PAGE_SIZE,
      search: receiptFilters.q,
      status: receiptFilters.status,
    }),
    listDocsPage('payslip', {
      page: payslipFilters.page,
      pageSize: PAGE_SIZE,
      search: payslipFilters.q,
      status: payslipFilters.status,
    }),
  ])

  return {
    tutors,
    receipts: toLedgerView('Receipts', 'receipts', receiptsPage, receiptFilters, payslipFilters),
    payslips: toLedgerView('Pay slips', 'payslips', payslipsPage, payslipFilters, receiptFilters),
  }
}
