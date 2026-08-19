import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  selectDocsForParty,
  selectAllDocs,
  selectRecentDocs,
  selectDocPage,
  callFinanceTotals,
  callFinanceTotalsBase,
  selectDocById,
  selectDocLines,
} from '@/lib/data/finance-docs-reads'

const doc = { id: 'd1', number: 'CEA-R-1', total: 100 }

beforeEach(() => vi.resetAllMocks())

describe('finance-docs-reads data layer', () => {
  it('selectDocsForParty maps rows (RLS client) and throws a kind-namespaced error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [doc], error: null }) as any)
    const rows = await selectDocsForParty('receipt', 'p1')
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('d1')
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectDocsForParty('receipt', 'p1')).rejects.toThrow(/receipt.listMine: e/)
  })

  it('selectAllDocs / selectRecentDocs map rows (service role) and throw on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [doc], error: null }) as any)
    expect(await selectAllDocs('payslip')).toHaveLength(1)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [doc], error: null }) as any)
    expect(await selectRecentDocs('receipt', 5)).toHaveLength(1)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectAllDocs('receipt')).rejects.toThrow(/receipt.listAll: e/)
  })

  it('selectDocPage returns rows + an exact total and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [doc], error: null, count: 12 }) as any)
    const page = await selectDocPage('receipt', { from: 0, to: 9 } as any)
    expect(page.total).toBe(12)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectDocPage('receipt', { from: 0, to: 9 } as any)).rejects.toThrow(/receipt.listPage: e/)
  })

  it('callFinanceTotals maps rpc rows and throws on rpc error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient(
        { data: null, error: null },
        {
          data: [{ currency: 'USD', live_total: '250', live_count: '2' }],
          error: null,
        },
      ) as any,
    )
    expect(await callFinanceTotals('receipt')).toEqual([{ currency: 'USD', live_total: 250, live_count: 2 }])
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: null, error: null }, { data: null, error: { message: 'e' } }) as any,
    )
    await expect(callFinanceTotals('receipt')).rejects.toThrow(/receipt.totals: e/)
  })

  it('callFinanceTotalsBase shapes the first rpc row with numeric defaults', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient(
        { data: null, error: null },
        {
          data: [{ base_currency: 'INR', base_total: '1000', converted_count: '3', unconverted_count: '1' }],
          error: null,
        },
      ) as any,
    )
    expect(await callFinanceTotalsBase('payslip')).toEqual({
      base_currency: 'INR',
      base_total: 1000,
      converted_count: 3,
      unconverted_count: 1,
    })
    // No rows -> empty/zero defaults.
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: null, error: null }, { data: [], error: null }) as any,
    )
    expect(await callFinanceTotalsBase('receipt')).toEqual({
      base_currency: '',
      base_total: 0,
      converted_count: 0,
      unconverted_count: 0,
    })
  })

  it('selectDocById returns a mapped doc or null (RLS client) and throws on error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: doc, error: null }) as any)
    expect((await selectDocById('receipt', 'd1'))?.id).toBe('d1')
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    expect(await selectDocById('receipt', 'gone')).toBeNull()
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectDocById('receipt', 'd1')).rejects.toThrow(/receipt.getById: e/)
  })

  it('selectDocLines maps line rows and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ id: 'l1' }], error: null }) as any)
    expect(await selectDocLines('receipt', 'd1')).toHaveLength(1)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectDocLines('receipt', 'd1')).rejects.toThrow(/receipt.getLines: e/)
  })
})
