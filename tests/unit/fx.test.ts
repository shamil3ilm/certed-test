import { describe, it, expect } from 'vitest'
import { resolveRate, type ExchangeRate } from '@/lib/finance/fx'
import { convertMoney } from '@/lib/money'

const rate = (over: Partial<ExchangeRate>): ExchangeRate => ({
  id: 'r1',
  currency: 'USD',
  base_currency: 'INR',
  rate: 82,
  effective_from: '2026-01-01',
  ...over,
})

describe('resolveRate', () => {
  it('is an identity (rate 1, no row) when the currency already is the base', () => {
    expect(resolveRate([], 'INR', 'INR', '2026-03-15')).toEqual({ rate: 1, rateId: null })
  })

  it('picks the newest rate on or before the document date', () => {
    const rates = [
      rate({ id: 'jan', rate: 82, effective_from: '2026-01-01' }),
      rate({ id: 'jun', rate: 88.5, effective_from: '2026-06-01' }),
    ]
    expect(resolveRate(rates, 'USD', 'INR', '2026-03-15')).toEqual({ rate: 82, rateId: 'jan' })
    expect(resolveRate(rates, 'USD', 'INR', '2026-07-02')).toEqual({ rate: 88.5, rateId: 'jun' })
    // Exactly on the effective date counts.
    expect(resolveRate(rates, 'USD', 'INR', '2026-06-01')).toEqual({ rate: 88.5, rateId: 'jun' })
  })

  it('returns null when no rate is effective on or before the date', () => {
    const rates = [rate({ effective_from: '2026-06-01' })]
    expect(resolveRate(rates, 'USD', 'INR', '2026-03-15')).toBeNull()
  })

  it('ignores rates for a different currency or a different base', () => {
    const rates = [
      rate({ id: 'aed', currency: 'AED', rate: 22.3 }),
      rate({ id: 'usd-usd-base', base_currency: 'USD', rate: 1.1 }),
    ]
    expect(resolveRate(rates, 'USD', 'INR', '2026-03-15')).toBeNull()
  })
})

describe('convertMoney (same $100 varies by its date rate)', () => {
  it('converts value x rate, rounded to the base currency minor unit', () => {
    expect(convertMoney(100, 82, 'INR')).toBe(8200)
    expect(convertMoney(100, 88.5, 'INR')).toBe(8850)
    // 3-decimal base currency (fils) rounds to 3 places.
    expect(convertMoney(100, 0.0122, 'KWD')).toBe(1.22)
  })
})
