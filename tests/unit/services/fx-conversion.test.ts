import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/data/org-settings', () => ({ selectOrgSettings: vi.fn() }))
vi.mock('@/lib/data/exchange-rates', () => ({ selectExchangeRates: vi.fn() }))
vi.mock('@/lib/data/finance-fx', () => ({
  selectConvertibleDocs: vi.fn(),
  selectConvertibleDoc: vi.fn(),
  callFxSourceVersion: vi.fn(),
  callApplyFxConversions: vi.fn(),
}))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))

import { requireActorCapability } from '@/lib/services/authorization'
import { selectOrgSettings } from '@/lib/data/org-settings'
import { selectExchangeRates } from '@/lib/data/exchange-rates'
import {
  callApplyFxConversions,
  callFxSourceVersion,
  selectConvertibleDoc,
  selectConvertibleDocs,
  type PricedDoc,
} from '@/lib/data/finance-fx'
import { writeAudit } from '@/lib/data/audit'
import { recomputeConversions, convertIssuedDoc } from '@/lib/services/finance/fx-conversion'

const RATES = [
  { id: 'jan', currency: 'USD', base_currency: 'INR', rate: 82, effective_from: '2026-01-01' },
  { id: 'jun', currency: 'USD', base_currency: 'INR', rate: 88.5, effective_from: '2026-06-01' },
]

/** The figures handed to the write on its Nth call, by document id. */
function written(call = 0): Record<string, PricedDoc> {
  const rows = vi.mocked(callApplyFxConversions).mock.calls[call][1]
  return Object.fromEntries(rows.map((row) => [row.id, row]))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireActorCapability).mockResolvedValue(undefined as never)
  vi.mocked(selectOrgSettings).mockResolvedValue({ base_currency: 'INR' } as never)
  vi.mocked(selectExchangeRates).mockResolvedValue(RATES as never)
  vi.mocked(callFxSourceVersion).mockResolvedValue('v1')
  vi.mocked(callApplyFxConversions).mockResolvedValue({ ok: true, written: 0 })
  vi.mocked(writeAudit).mockResolvedValue(undefined as never)
})

describe('recomputeConversions', () => {
  it('prices each document at its OWN issue_date rate and counts converted vs flagged', async () => {
    vi.mocked(selectConvertibleDocs).mockImplementation(async (kind) =>
      kind === 'receipt'
        ? [
            { id: 'r1', currency: 'USD', issue_date: '2026-03-15', total: 100 }, // Jan rate 82
            { id: 'r2', currency: 'USD', issue_date: '2026-07-02', total: 100 }, // Jun rate 88.5
            { id: 'r3', currency: 'INR', issue_date: '2026-05-01', total: 500 }, // identity
            { id: 'r4', currency: 'AED', issue_date: '2026-05-01', total: 50 }, //  no AED rate
          ]
        : [],
    )

    const result = await recomputeConversions('admin-1')

    const byId = written()
    expect(byId.r1).toEqual({
      kind: 'receipt',
      id: 'r1',
      base_currency: 'INR',
      base_total: 8200,
      fx_rate: 82,
      fx_rate_id: 'jan',
    })
    expect(byId.r2).toMatchObject({ base_total: 8850, fx_rate: 88.5, fx_rate_id: 'jun' })
    expect(byId.r3).toMatchObject({ base_total: 500, fx_rate: 1, fx_rate_id: null }) // identity
    expect(byId.r4).toMatchObject({ base_total: null, fx_rate: null, fx_rate_id: null }) // unpriced
    expect(result).toEqual({ converted: 3, unconverted: 1 })
    expect(requireActorCapability).toHaveBeenCalledWith('admin-1', 'manageAdminTier', expect.any(String))
  })

  /**
   * Writing a document at a time would let a failure part-way leave the catalogue on two rates,
   * and two racing recomputes leave the older rates' figures in place. So every figure goes in
   * ONE write, tagged with the version of the inputs it was priced from.
   */
  it('writes every document of every kind in ONE call, tagged with the version read BEFORE the inputs', async () => {
    const order: string[] = []
    vi.mocked(callFxSourceVersion).mockImplementation(async () => {
      order.push('version')
      return 'v7'
    })
    vi.mocked(selectExchangeRates).mockImplementation(async () => {
      order.push('rates')
      return RATES as never
    })
    vi.mocked(selectConvertibleDocs).mockImplementation(async (kind) => [
      { id: `${kind}-1`, currency: 'INR', issue_date: '2026-01-01', total: 1 },
    ])

    await recomputeConversions('admin-1')

    expect(order.indexOf('version')).toBeLessThan(order.indexOf('rates'))
    expect(callApplyFxConversions).toHaveBeenCalledTimes(1)
    expect(vi.mocked(callApplyFxConversions).mock.calls[0][0]).toBe('v7')
    expect(Object.keys(written())).toEqual(['receipt-1', 'payslip-1'])
  })

  it('prices again when the rates change under it, and writes the fresh figures', async () => {
    vi.mocked(selectConvertibleDocs).mockImplementation(async (kind) =>
      kind === 'receipt' ? [{ id: 'r1', currency: 'USD', issue_date: '2026-07-02', total: 10 }] : [],
    )
    vi.mocked(callFxSourceVersion).mockResolvedValueOnce('old').mockResolvedValueOnce('new')
    vi.mocked(callApplyFxConversions)
      .mockResolvedValueOnce({ ok: false, reason: 'fx_source_changed' })
      .mockResolvedValueOnce({ ok: true, written: 1 })

    await expect(recomputeConversions('admin-1')).resolves.toEqual({ converted: 1, unconverted: 0 })
    expect(vi.mocked(callApplyFxConversions).mock.calls.map((c) => c[0])).toEqual(['old', 'new'])
    expect(writeAudit).toHaveBeenCalledTimes(1)
  })

  it('gives up, loudly and unaudited, when the inputs never settle', async () => {
    vi.mocked(selectConvertibleDocs).mockResolvedValue([])
    vi.mocked(callApplyFxConversions).mockResolvedValue({ ok: false, reason: 'fx_source_changed' })

    await expect(recomputeConversions('admin-1')).rejects.toThrow(/kept changing/)
    expect(callApplyFxConversions).toHaveBeenCalledTimes(3)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('propagates a write failure rather than reporting a complete recompute', async () => {
    vi.mocked(selectConvertibleDocs).mockResolvedValue([
      { id: 'd1', currency: 'USD', issue_date: '2026-01-01', total: 1 },
    ])
    vi.mocked(callApplyFxConversions).mockRejectedValue(new Error('write failed'))
    await expect(recomputeConversions('admin-1')).rejects.toThrow(/write failed/)
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

describe('convertIssuedDoc', () => {
  it('converts a single freshly-issued document at its date rate', async () => {
    vi.mocked(selectConvertibleDoc).mockResolvedValue({
      id: 'r9',
      currency: 'USD',
      issue_date: '2026-07-02',
      total: 200,
    })

    await convertIssuedDoc('receipt', 'r9')

    expect(callApplyFxConversions).toHaveBeenCalledWith('v1', [
      { kind: 'receipt', id: 'r9', base_currency: 'INR', base_total: 17700, fx_rate: 88.5, fx_rate_id: 'jun' },
    ])
  })

  it('does nothing when the document is missing or voided', async () => {
    vi.mocked(selectConvertibleDoc).mockResolvedValue(null)
    await convertIssuedDoc('receipt', 'gone')
    expect(callApplyFxConversions).not.toHaveBeenCalled()
  })

  it('stops after a few refusals - the recompute each rate change runs prices it instead', async () => {
    vi.mocked(selectConvertibleDoc).mockResolvedValue({ id: 'r9', currency: 'USD', issue_date: '2026-07-02', total: 1 })
    vi.mocked(callApplyFxConversions).mockResolvedValue({ ok: false, reason: 'fx_source_changed' })
    await expect(convertIssuedDoc('receipt', 'r9')).resolves.toBeUndefined()
    expect(callApplyFxConversions).toHaveBeenCalledTimes(3)
  })
})
