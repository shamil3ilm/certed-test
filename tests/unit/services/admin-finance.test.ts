import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/money', () => ({ formatMoney: vi.fn((amount: number, currency: string) => `${currency}:${amount}`) }))
vi.mock('@/lib/services/users', () => ({ listActiveByRole: vi.fn(), listActiveMentorCandidates: vi.fn() }))
vi.mock('@/lib/services/finance/finance-docs', () => ({ listDocsPage: vi.fn(), FINANCE_DENIED: 'denied' }))
vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))

import { listDocsPage } from '@/lib/services/finance/finance-docs'
import { loadAdminFinancePageData, financeUrl, searchFinanceStudents } from '@/lib/services/finance/admin-finance'
import { listActiveByRole, listActiveMentorCandidates } from '@/lib/services/users'
import { requireActorCapability } from '@/lib/services/authorization'
import { PermissionError } from '@/lib/errors'

beforeEach(() => vi.resetAllMocks())

describe('financeUrl', () => {
  it('carries the sibling ledger filters through the URL', () => {
    expect(
      financeUrl('receipts', { page: 2, q: 'A-1', status: 'active' }, { page: 3, q: 'Maya', status: 'voided' }),
    ).toBe('/admin/finance?rPage=2&rq=A-1&rstatus=active&pPage=3&pq=Maya&pstatus=voided#receipts')
  })
})

describe('loadAdminFinancePageData', () => {
  it('parses filters, loads pay-slip payees, and shapes document rows', async () => {
    vi.mocked(listActiveMentorCandidates).mockResolvedValueOnce([{ id: 't1', name: 'tutor@test.com' }] as any)
    vi.mocked(listDocsPage)
      .mockResolvedValueOnce({
        items: [{ id: 'r1', number: 'R-001', party_name: 'Sara Student', total: 1200, currency: 'INR', voided: false }],
        total: 21,
      } as any)
      .mockResolvedValueOnce({
        items: [{ id: 'p1', number: 'P-010', party_name: 'tutor@test.com', total: 900, currency: 'INR', voided: true }],
        total: 5,
      } as any)

    const result = await loadAdminFinancePageData({
      canManage: true,
      rPage: '2',
      rq: ' R-001 ',
      rstatus: 'active',
      pPage: '3',
      pq: ' tutor ',
      pstatus: 'voided',
    })

    expect(listDocsPage).toHaveBeenNthCalledWith(1, 'receipt', {
      page: 2,
      pageSize: 20,
      search: 'R-001',
      status: 'active',
    })
    expect(listDocsPage).toHaveBeenNthCalledWith(2, 'payslip', {
      page: 3,
      pageSize: 20,
      search: 'tutor',
      status: 'voided',
    })
    // Students are searched on demand (searchFinanceStudents), never eagerly loaded.
    expect(listActiveByRole).not.toHaveBeenCalled()
    expect(result.tutors).toEqual([{ id: 't1', name: 'tutor@test.com' }])
    expect(result.receipts.rows).toEqual([
      { id: 'r1', number: 'R-001', name: 'Sara Student', totalLabel: 'INR:1200', baseLabel: null, voided: false },
    ])
    expect(result.receipts.totalPages).toBe(2)
    expect(result.payslips.rows).toEqual([
      { id: 'p1', number: 'P-010', name: 'tutor@test.com', totalLabel: 'INR:900', baseLabel: null, voided: true },
    ])
    expect(result.payslips.totalPages).toBe(1)
  })

  it('normalizes invalid or blank filters to defaults', async () => {
    vi.mocked(listActiveMentorCandidates).mockResolvedValueOnce([] as any)
    vi.mocked(listDocsPage)
      .mockResolvedValueOnce({ items: [], total: 0 } as any)
      .mockResolvedValueOnce({ items: [], total: 0 } as any)

    await loadAdminFinancePageData({
      canManage: true,
      rPage: '0',
      rq: '   ',
      rstatus: 'bad',
      pPage: 'x',
      pq: '',
      pstatus: 'oops',
    } as any)

    expect(listDocsPage).toHaveBeenNthCalledWith(1, 'receipt', {
      page: 1,
      pageSize: 20,
      search: undefined,
      status: undefined,
    })
    expect(listDocsPage).toHaveBeenNthCalledWith(2, 'payslip', {
      page: 1,
      pageSize: 20,
      search: undefined,
      status: undefined,
    })
  })
})

describe('searchFinanceStudents', () => {
  it('refuses a caller without manageAdminTier, and never reaches the roster', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(new PermissionError('nope'))
    await expect(searchFinanceStudents('not-admin', 'sara')).rejects.toBeInstanceOf(PermissionError)
    expect(listActiveByRole).not.toHaveBeenCalled()
  })

  it('searches the student roster bounded and trimmed for an admin', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined as any)
    vi.mocked(listActiveByRole).mockResolvedValueOnce([{ id: 's1', name: 'Sara Student' }] as any)

    const rows = await searchFinanceStudents('admin-1', '  sara ')

    // Gated on the hard-rule finance capability, not viewFinance.
    expect(requireActorCapability).toHaveBeenCalledWith('admin-1', 'manageAdminTier', 'denied')
    expect(listActiveByRole).toHaveBeenCalledWith('student', { search: 'sara', limit: 10 })
    expect(rows).toEqual([{ id: 's1', name: 'Sara Student' }])
  })

  it('short-circuits a too-short term to an empty list without querying the roster', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined as any)

    const rows = await searchFinanceStudents('admin-1', ' a ')

    expect(rows).toEqual([])
    expect(listActiveByRole).not.toHaveBeenCalled()
  })
})
