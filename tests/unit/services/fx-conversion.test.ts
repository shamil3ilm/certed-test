import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/data/org-settings', () => ({ selectOrgSettings: vi.fn() }))
vi.mock('@/lib/data/exchange-rates', () => ({ selectExchangeRates: vi.fn() }))
vi.mock('@/lib/data/finance-fx', () => ({
  selectConvertibleDocs: vi.fn(),
  selectConvertibleDoc: vi.fn(),
  updateDocConversion: vi.fn(),
}))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))

import { requireActorCapability } from '@/lib/services/authorization'
import { selectOrgSettings } from '@/lib/data/org-settings'
import { selectExchangeRates } from '@/lib/data/exchange-rates'
import { selectConvertibleDocs, selectConvertibleDoc, updateDocConversion } from '@/lib/data/finance-fx'
import { writeAudit } from '@/lib/data/audit'
import { recomputeConversions, convertIssuedDoc } from '@/lib/services/finance/fx-conversion'

const RATES = [
  { id: 'jan', currency: 'USD', base_currency: 'INR', rate: 82, effective_from: '2026-01-01' },
  { id: 'jun', currency: 'USD', base_currency: 'INR', rate: 88.5, effective_from: '2026-06-01' },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireActorCapability).mockResolvedValue(undefined as any)
  vi.mocked(selectOrgSettings).mockResolvedValue({ base_currency: 'INR' } as any)
  vi.mocked(selectExchangeRates).mockResolvedValue(RATES as any)
  vi.mocked(updateDocConversion).mockResolvedValue(undefined as any)
  vi.mocked(writeAudit).mockResolvedValue(undefined as any)
})

describe('recomputeConversions', () => {
  it('prices each document at its OWN issue_date rate and counts converted vs flagged', async () => {
    vi.mocked(selectConvertibleDocs).mockImplementation(async (kind: any) =>
      kind === 'receipt'
        ? ([
            { id: 'r1', currency: 'USD', issue_date: '2026-03-15', total: 100 }, // Jan rate 82
            { id: 'r2', currency: 'USD', issue_date: '2026-07-02', total: 100 }, // Jun rate 88.5
            { id: 'r3', currency: 'INR', issue_date: '2026-05-01', total: 500 }, // identity
            { id: 'r4', currency: 'AED', issue_date: '2026-05-01', total: 50 }, //  no AED rate
          ] as any)
        : ([] as any),
    )

    const result = await recomputeConversions('admin-1')

    const byId = Object.fromEntries(vi.mocked(updateDocConversion).mock.calls.map(([, id, conv]) => [id, conv]))
    expect(byId.r1).toEqual({ base_currency: 'INR', base_total: 8200, fx_rate: 82, fx_rate_id: 'jan' })
    expect(byId.r2).toEqual({ base_currency: 'INR', base_total: 8850, fx_rate: 88.5, fx_rate_id: 'jun' })
    expect(byId.r3).toEqual({ base_currency: 'INR', base_total: 500, fx_rate: 1, fx_rate_id: null }) // identity
    expect(byId.r4).toEqual({ base_currency: 'INR', base_total: null, fx_rate: null, fx_rate_id: null }) // unpriced
    expect(result).toEqual({ converted: 3, unconverted: 1 })
    expect(requireActorCapability).toHaveBeenCalledWith('admin-1', 'manageAdminTier', expect.any(String))
  })
})

describe('convertIssuedDoc', () => {
  it('converts a single freshly-issued document at its date rate', async () => {
    vi.mocked(selectConvertibleDoc).mockResolvedValue({
      id: 'r9',
      currency: 'USD',
      issue_date: '2026-07-02',
      total: 200,
    } as any)

    await convertIssuedDoc('receipt', 'r9')

    expect(updateDocConversion).toHaveBeenCalledWith('receipt', 'r9', {
      base_currency: 'INR',
      base_total: 17700, // 200 * 88.5
      fx_rate: 88.5,
      fx_rate_id: 'jun',
    })
  })

  it('does nothing when the document is missing or voided', async () => {
    vi.mocked(selectConvertibleDoc).mockResolvedValue(null as any)
    await convertIssuedDoc('receipt', 'gone')
    expect(updateDocConversion).not.toHaveBeenCalled()
  })
})
