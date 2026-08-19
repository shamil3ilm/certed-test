import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import {
  selectConvertibleDocs,
  selectConvertibleDoc,
  selectUnconvertedCurrencies,
  updateDocConversion,
} from '@/lib/data/finance-fx'

beforeEach(() => vi.resetAllMocks())

describe('finance-fx data layer (base-currency overlay)', () => {
  it('selectConvertibleDocs maps rows and coerces total to a number', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: 'r1', currency: 'USD', issue_date: '2026-01-01', total: '250' }], error: null }) as any,
    )
    expect(await selectConvertibleDocs('receipt')).toEqual([
      { id: 'r1', currency: 'USD', issue_date: '2026-01-01', total: 250 },
    ])
  })

  it('selectConvertibleDocs throws a kind-namespaced error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'boom' } }) as any)
    await expect(selectConvertibleDocs('payslip')).rejects.toThrow(/payslip.convertible: boom/)
  })

  it('selectConvertibleDoc returns null for a missing/voided doc, else the mapped row', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    expect(await selectConvertibleDoc('receipt', 'gone')).toBeNull()
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: { id: 'r1', currency: 'EUR', issue_date: '2026-02-02', total: '99.5' }, error: null }) as any,
    )
    expect(await selectConvertibleDoc('receipt', 'r1')).toEqual({
      id: 'r1',
      currency: 'EUR',
      issue_date: '2026-02-02',
      total: 99.5,
    })
  })

  it('selectConvertibleDoc throws on a query error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'x' } }) as any)
    await expect(selectConvertibleDoc('receipt', 'r1')).rejects.toThrow(/receipt.convertibleOne: x/)
  })

  it('selectUnconvertedCurrencies unions receipts + payslips into a distinct set', async () => {
    // The one client is reused for both kinds; both iterations return the same rows,
    // so the Set must collapse the duplicate currency.
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ currency: 'USD' }, { currency: 'INR' }], error: null }) as any,
    )
    expect((await selectUnconvertedCurrencies()).sort()).toEqual(['INR', 'USD'])
  })

  it('selectUnconvertedCurrencies throws on a query error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectUnconvertedCurrencies()).rejects.toThrow(/unconvertedCurrencies: e/)
  })

  it('updateDocConversion resolves on success and throws on error', async () => {
    const conv = { base_currency: 'INR', base_total: 1000, fx_rate: 4, fx_rate_id: 'fx1' }
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(updateDocConversion('receipt', 'r1', conv)).resolves.toBeUndefined()
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'no' } }) as any)
    await expect(updateDocConversion('receipt', 'r1', conv)).rejects.toThrow(/receipt.updateConversion: no/)
  })
})
