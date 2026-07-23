import { formatMoney } from '@/lib/money'
import { listProfiles } from '@/lib/services/users'
import { listDocsPage, type FinanceDoc } from '@/lib/services/finance/finance-docs'

const PAGE_SIZE = 20

export type FinanceStatus = 'active' | 'voided'
export type FinanceFilters = { page: number; q?: string; status?: FinanceStatus }
export type FinancePageKind = 'receipts' | 'payslips'
export type FinancePageParty = { id: string; name: string }
export type FinancePageRow = {
  id: string
  number: string
  name: string
  totalLabel: string
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
  students: FinancePageParty[]
  tutors: FinancePageParty[]
  receipts: FinanceLedgerView
  payslips: FinanceLedgerView
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
      page: Math.max(1, Number(searchParams.rPage) || 1),
      q: searchParams.rq?.trim() || undefined,
      status: parseStatus(searchParams.rstatus),
    },
    payslipFilters: {
      page: Math.max(1, Number(searchParams.pPage) || 1),
      q: searchParams.pq?.trim() || undefined,
      status: parseStatus(searchParams.pstatus),
    },
  }
}

function toParties(
  profiles: Array<{ id: string; full_name: string | null; email: string; role: string }>,
  roles: string[],
): FinancePageParty[] {
  return profiles.filter((p) => roles.includes(p.role)).map((p) => ({ id: p.id, name: p.full_name ?? p.email }))
}

function toRows(items: FinanceDoc[]): FinancePageRow[] {
  return items.map((d) => ({
    id: d.id,
    number: d.number,
    name: d.party_name,
    totalLabel: formatMoney(d.total, d.currency),
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
    totalPages: Math.max(1, Math.ceil(page.total / PAGE_SIZE)),
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
}): Promise<AdminFinancePageData> {
  const { receiptFilters, payslipFilters } = toFilters(searchParams)
  const [profiles, receiptsPage, payslipsPage] = await Promise.all([
    listProfiles(),
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
    students: toParties(profiles, ['student']),
    // Pay-slip payees: tutors plus dedicated (non-tutor) mentors.
    tutors: toParties(profiles, ['tutor', 'mentor']),
    receipts: toLedgerView('Receipts', 'receipts', receiptsPage, receiptFilters, payslipFilters),
    payslips: toLedgerView('Pay slips', 'payslips', payslipsPage, payslipFilters, receiptFilters),
  }
}
