import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/data/exchange-rates', () => ({
  selectExchangeRates: vi.fn(),
  upsertExchangeRate: vi.fn(),
  deleteExchangeRate: vi.fn(),
}))
vi.mock('@/lib/data/finance-fx', () => ({ selectUnconvertedCurrencies: vi.fn() }))
vi.mock('@/lib/data/org-settings', () => ({ selectOrgSettings: vi.fn(), updateBaseCurrency: vi.fn() }))
vi.mock('@/lib/services/finance/fx-conversion', () => ({ recomputeConversions: vi.fn() }))

import { requireActorCapability } from '@/lib/services/authorization'
import { selectExchangeRates, upsertExchangeRate, deleteExchangeRate } from '@/lib/data/exchange-rates'
import { selectUnconvertedCurrencies } from '@/lib/data/finance-fx'
import { selectOrgSettings, updateBaseCurrency } from '@/lib/data/org-settings'
import { recomputeConversions } from '@/lib/services/finance/fx-conversion'
import {
  exchangeRateSchema,
  loadFxRatesPageData,
  addExchangeRate,
  removeExchangeRate,
  setBaseCurrency,
} from '@/lib/services/finance/fx-admin'
import { ValidationError } from '@/lib/errors'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireActorCapability).mockResolvedValue(undefined as any)
  vi.mocked(selectOrgSettings).mockResolvedValue({ base_currency: 'INR' } as any)
  vi.mocked(recomputeConversions).mockResolvedValue({ converted: 0, unconverted: 0 } as any)
})

describe('exchangeRateSchema', () => {
  it('accepts a supported currency, positive rate and ISO date; coerces the rate', () => {
    const parsed = exchangeRateSchema.parse({ currency: 'USD', rate: '82.5', effective_from: '2026-01-01' })
    expect(parsed).toMatchObject({ currency: 'USD', rate: 82.5, effective_from: '2026-01-01' })
  })

  it('rejects an unsupported currency, a non-positive rate, and a bad date', () => {
    expect(exchangeRateSchema.safeParse({ currency: 'XYZ', rate: 1, effective_from: '2026-01-01' }).success).toBe(false)
    expect(exchangeRateSchema.safeParse({ currency: 'USD', rate: 0, effective_from: '2026-01-01' }).success).toBe(false)
    expect(exchangeRateSchema.safeParse({ currency: 'USD', rate: 5, effective_from: '01/01/2026' }).success).toBe(false)
  })
})

describe('loadFxRatesPageData', () => {
  it('returns the base, rates and the missing-rate to-do list (base excluded)', async () => {
    vi.mocked(selectExchangeRates).mockResolvedValue([{ id: 'r1', currency: 'USD' }] as any)
    vi.mocked(selectUnconvertedCurrencies).mockResolvedValue(['USD', 'INR', 'AED'] as any)

    const data = await loadFxRatesPageData('admin-1')

    expect(data.baseCurrency).toBe('INR')
    expect(data.rates).toEqual([{ id: 'r1', currency: 'USD' }])
    expect(data.needingRate).toEqual(['USD', 'AED']) // INR (the base) filtered out
    expect(data.currencies).toContain('AED')
    expect(requireActorCapability).toHaveBeenCalledWith('admin-1', 'manageAdminTier', expect.any(String))
  })
})

describe('addExchangeRate', () => {
  it('upserts against the current base and recomputes', async () => {
    await addExchangeRate('admin-1', { currency: 'USD', rate: 82, effective_from: '2026-01-01', note: null })
    expect(upsertExchangeRate).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'USD', base_currency: 'INR', rate: 82, created_by: 'admin-1' }),
    )
    expect(recomputeConversions).toHaveBeenCalledWith('admin-1')
  })

  it('rejects a rate for the base currency itself (it converts one to one)', async () => {
    await expect(
      addExchangeRate('admin-1', { currency: 'INR', rate: 1, effective_from: '2026-01-01', note: null }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(upsertExchangeRate).not.toHaveBeenCalled()
  })

  it('rejects invalid input without touching the table', async () => {
    await expect(addExchangeRate('admin-1', { currency: 'USD', rate: -1 })).rejects.toBeInstanceOf(ValidationError)
    expect(upsertExchangeRate).not.toHaveBeenCalled()
  })
})

describe('removeExchangeRate', () => {
  it('deletes then recomputes', async () => {
    await removeExchangeRate('admin-1', 'rate-1')
    expect(deleteExchangeRate).toHaveBeenCalledWith('rate-1')
    expect(recomputeConversions).toHaveBeenCalledWith('admin-1')
  })

  it('rejects an empty id', async () => {
    await expect(removeExchangeRate('admin-1', '')).rejects.toBeInstanceOf(ValidationError)
    expect(deleteExchangeRate).not.toHaveBeenCalled()
  })
})

describe('setBaseCurrency', () => {
  it('updates the base and re-prices every document', async () => {
    await setBaseCurrency('admin-1', 'AED')
    expect(updateBaseCurrency).toHaveBeenCalledWith('AED')
    expect(recomputeConversions).toHaveBeenCalledWith('admin-1')
  })

  it('rejects an unsupported currency', async () => {
    await expect(setBaseCurrency('admin-1', 'XYZ')).rejects.toBeInstanceOf(ValidationError)
    expect(updateBaseCurrency).not.toHaveBeenCalled()
  })
})
