import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  selectDocPageForParty,
  selectAllDocs,
  selectRecentDocs,
  selectDocPage,
  callFinanceTotalsBase,
  selectDocById,
  selectDocLines,
} from '@/lib/data/finance-docs-reads'

const doc = { id: 'd1', number: 'CEA-R-1', total: 100 }

beforeEach(() => vi.resetAllMocks())

describe('finance-docs-reads data layer', () => {
  it('selectDocPageForParty reads through RLS, NOT the service role', async () => {
    // This is the self-service list: the caller may only ever see their own documents, so
    // the database stays the gate and partyId is a narrowing filter. Reading it service-role
    // would move that boundary into app code, where a future caller passing someone else's
    // id is a leak nothing catches.
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [doc], error: null }) as any)
    const page = await selectDocPageForParty('receipt', 'p1', { from: 0, to: 19 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0].id).toBe('d1')
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('selectDocPageForParty scopes to the party, pages, and reports the query total', async () => {
    const client = makeClient({ data: [doc], error: null, count: 7 })
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const page = await selectDocPageForParty('receipt', 'p1', { from: 20, to: 39 })
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('student_id', 'p1')
    expect(builder.range).toHaveBeenCalledWith(20, 39)
    expect(page.total).toBe(7)
  })

  it('selectDocPageForParty surfaces an error rather than an empty list', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectDocPageForParty('receipt', 'p1', { from: 0, to: 19 })).rejects.toThrow(/receipt.listMinePage: e/)
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
