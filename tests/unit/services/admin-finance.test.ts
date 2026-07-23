import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/money', () => ({ formatMoney: vi.fn((amount: number, currency: string) => `${currency}:${amount}`) }))
vi.mock('@/lib/services/users', () => ({ listProfiles: vi.fn() }))
vi.mock('@/lib/services/finance/finance-docs', () => ({ listDocsPage: vi.fn() }))

import { listDocsPage } from '@/lib/services/finance/finance-docs'
import { loadAdminFinancePageData, financeUrl } from '@/lib/services/finance/admin-finance'
import { listProfiles } from '@/lib/services/users'

beforeEach(() => vi.resetAllMocks())

describe('financeUrl', () => {
  it('carries the sibling ledger filters through the URL', () => {
    expect(
      financeUrl('receipts', { page: 2, q: 'A-1', status: 'active' }, { page: 3, q: 'Maya', status: 'voided' }),
    ).toBe('/admin/finance?rPage=2&rq=A-1&rstatus=active&pPage=3&pq=Maya&pstatus=voided#receipts')
  })
})

describe('loadAdminFinancePageData', () => {
  it('parses filters and shapes party lists plus document rows', async () => {
    vi.mocked(listProfiles).mockResolvedValueOnce([
      { id: 's1', full_name: 'Sara Student', email: 'sara@test.com', role: 'student' },
      { id: 't1', full_name: null, email: 'tutor@test.com', role: 'tutor' },
      { id: 'a1', full_name: 'Admin User', email: 'admin@test.com', role: 'admin' },
    ] as any)
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
    expect(result.students).toEqual([{ id: 's1', name: 'Sara Student' }])
    expect(result.tutors).toEqual([{ id: 't1', name: 'tutor@test.com' }])
    expect(result.receipts.rows).toEqual([
      { id: 'r1', number: 'R-001', name: 'Sara Student', totalLabel: 'INR:1200', voided: false },
    ])
    expect(result.receipts.totalPages).toBe(2)
    expect(result.payslips.rows).toEqual([
      { id: 'p1', number: 'P-010', name: 'tutor@test.com', totalLabel: 'INR:900', voided: true },
    ])
    expect(result.payslips.totalPages).toBe(1)
  })

  it('normalizes invalid or blank filters to defaults', async () => {
    vi.mocked(listProfiles).mockResolvedValueOnce([] as any)
    vi.mocked(listDocsPage)
      .mockResolvedValueOnce({ items: [], total: 0 } as any)
      .mockResolvedValueOnce({ items: [], total: 0 } as any)

    await loadAdminFinancePageData({
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
