import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import {
  selectConvertibleDocs,
  selectConvertibleDoc,
  selectUnconvertedCurrencies,
  callApplyFxConversions,
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

  it('callApplyFxConversions writes every priced figure in one call, with the version they were priced at', async () => {
    const rows = [
      { kind: 'receipt' as const, id: 'r1', base_currency: 'INR', base_total: 1000, fx_rate: 4, fx_rate_id: 'fx1' },
    ]
    const client = makeClient({ data: null, error: null }, { data: 1, error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await expect(callApplyFxConversions('v1', rows)).resolves.toEqual({ ok: true, written: 1 })
    expect(client.rpc).toHaveBeenCalledWith('apply_fx_conversions', { p_version: 'v1', p_rows: rows })
  })

  it('callApplyFxConversions reports inputs that moved as a refusal, and throws anything else', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: null, error: null }, { data: null, error: { message: 'fx_source_changed' } }) as any,
    )
    await expect(callApplyFxConversions('v1', [])).resolves.toEqual({ ok: false, reason: 'fx_source_changed' })
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: null, error: null }, { data: null, error: { message: 'no' } }) as any,
    )
    await expect(callApplyFxConversions('v1', [])).rejects.toThrow(/fx.applyConversions: no/)
  })
})

/**
 * recomputeConversions re-prices EVERY non-void receipt and pay slip after a rate change.
 * Unbounded, PostgREST returns only the first 1000 per kind and reports no error, so the
 * documents past the cap keep a base_total priced at the OLD rate while the caller's
 * {converted, unconverted} counts look entirely plausible. Money, silently stale.
 */
describe('selectConvertibleDocs is complete, not first-page-only', () => {
  it('pages through every convertible document', async () => {
    const { builder, client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)
    await selectConvertibleDocs('receipt')
    expect(builder.range).toHaveBeenCalled()
  })
})
