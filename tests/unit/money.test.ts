import { describe, it, expect } from 'vitest'
import { lineAmount, computeTotals, formatMoney, currencyDecimals } from '@/lib/money'

describe('currencyDecimals', () => {
  it('defaults to 2 and is case-insensitive', () => {
    expect(currencyDecimals('USD')).toBe(2)
    expect(currencyDecimals('inr')).toBe(2)
  })
  it('knows 3-decimal (fils) and 0-decimal currencies', () => {
    expect(currencyDecimals('KWD')).toBe(3)
    expect(currencyDecimals('BHD')).toBe(3)
    expect(currencyDecimals('OMR')).toBe(3)
    expect(currencyDecimals('JPY')).toBe(0)
  })
})

describe('lineAmount', () => {
  it('multiplies hours by rate, rounded to 2dp by default', () => {
    expect(lineAmount(7.5, 200)).toBe(1500)
    expect(lineAmount(1.333, 100)).toBe(133.3)
  })
  it('rounds to the currency minor unit (KWD = 3dp)', () => {
    expect(lineAmount(1, 1.2345, 'KWD')).toBe(1.235) // 3dp preserves fils
    expect(lineAmount(1, 1.2345)).toBe(1.23) // default INR = 2dp
  })
})

describe('computeTotals', () => {
  it('sums line amounts into subtotal and total', () => {
    const lines = [
      { hours: 7.5, rate: 200 }, // 1500
      { hours: 6, rate: 200 }, // 1200
    ]
    expect(computeTotals(lines)).toEqual({ subtotal: 2700, total: 2700 })
  })
  it('subtracts a discount from the total', () => {
    expect(computeTotals([{ hours: 10, rate: 100 }], 250)).toEqual({ subtotal: 1000, total: 750 })
  })
  it('rounds to the currency minor unit', () => {
    // 3 × 0.3335 = 1.0005 → 1.001 (KWD, 3dp) vs 1.00 (INR, 2dp)
    expect(computeTotals([{ hours: 3, rate: 0.3335 }], 0, 'KWD')).toEqual({ subtotal: 1.001, total: 1.001 })
    expect(computeTotals([{ hours: 3, rate: 0.3335 }])).toEqual({ subtotal: 1, total: 1 })
  })
  it('sums rounded line amounts so lines add up to the subtotal', () => {
    // Each 0.25 × 12.5 = 3.125 → prints 3.13; two of them must total 6.26, not
    // round(6.25) = 6.25 (the old per-line vs subtotal rounding mismatch).
    expect(
      computeTotals([
        { hours: 0.25, rate: 12.5 },
        { hours: 0.25, rate: 12.5 },
      ]),
    ).toEqual({
      subtotal: 6.26,
      total: 6.26,
    })
  })
})

describe('formatMoney', () => {
  it('formats INR with Indian lakh grouping', () => {
    expect(formatMoney(100000, 'INR')).toContain('1,00,000')
  })
  it('shows consistent 2 decimals within a document', () => {
    expect(formatMoney(1200, 'INR')).toContain('1,200.00')
  })
  it('uses standard grouping for USD (not Indian lakhs)', () => {
    const s = formatMoney(100000, 'USD')
    expect(s).toContain('100,000')
    expect(s).not.toContain('1,00,000')
  })
  it('shows 3 decimals for KWD (fils)', () => {
    expect(formatMoney(1.234, 'KWD')).toContain('1.234')
  })
  it('formats a GCC currency (AED)', () => {
    const s = formatMoney(1500, 'AED')
    expect(s).toMatch(/AED|د\.إ/)
  })
})
