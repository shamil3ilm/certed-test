import { describe, it, expect } from 'vitest'
import { lineAmount, computeTotals, formatMoney } from '@/lib/money'

describe('lineAmount', () => {
  it('multiplies hours by rate, rounded to 2dp', () => {
    expect(lineAmount(7.5, 200)).toBe(1500)
    expect(lineAmount(1.333, 100)).toBe(133.3)
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
})

describe('formatMoney', () => {
  it('formats INR', () => {
    expect(formatMoney(1500, 'INR')).toContain('1,500')
  })
  it('formats a GCC currency (AED)', () => {
    const s = formatMoney(1500, 'AED')
    expect(s).toMatch(/AED|د\.إ/)
  })
})
