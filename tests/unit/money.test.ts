import { describe, it, expect } from 'vitest'
import {
  lineAmount,
  computeTotals,
  formatMoney,
  currencyDecimals,
  netMoneyTotals,
  convertMoney,
  totalByCurrency,
  formatMoneyTotals,
  EMPTY_MONEY,
} from '@/lib/money'

describe('netMoneyTotals', () => {
  const t = (currency: string, live_total: number) => ({ currency, live_total })

  it('subtracts payout from revenue per currency', () => {
    expect(netMoneyTotals([t('INR', 1200)], [t('INR', 400)])).toEqual([t('INR', 800)])
  })

  it('keeps currencies present on only one side, and a payout-only one goes negative', () => {
    const net = netMoneyTotals([t('INR', 1000), t('USD', 50)], [t('INR', 400), t('AED', 100)])
    expect(net).toEqual(expect.arrayContaining([t('INR', 600), t('USD', 50), t('AED', -100)]))
    expect(net).toHaveLength(3)
  })

  it('drops a currency that exactly offsets to zero', () => {
    expect(netMoneyTotals([t('INR', 500)], [t('INR', 500)])).toEqual([])
  })

  it('rounds to the currency minor unit (fils for a 3-decimal currency)', () => {
    expect(netMoneyTotals([t('KWD', 1.235)], [t('KWD', 1.23)])).toEqual([t('KWD', 0.005)])
  })
})

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
    expect(computeTotals(lines)).toEqual({ subtotal: 2700, discount: 0, total: 2700 })
  })
  it('subtracts a discount from the total', () => {
    expect(computeTotals([{ hours: 10, rate: 100 }], 250)).toEqual({ subtotal: 1000, discount: 250, total: 750 })
  })
  it('rounds to the currency minor unit', () => {
    // 3 × 0.3335 = 1.0005 → 1.001 (KWD, 3dp) vs 1.00 (INR, 2dp)
    expect(computeTotals([{ hours: 3, rate: 0.3335 }], 0, 'KWD')).toEqual({
      subtotal: 1.001,
      discount: 0,
      total: 1.001,
    })
    expect(computeTotals([{ hours: 3, rate: 0.3335 }])).toEqual({ subtotal: 1, discount: 0, total: 1 })
  })
  it('rounds the discount to the minor unit and derives total from it', () => {
    // A sub-unit discount must round the SAME way it will be rendered, so the
    // stored subtotal - discount = total stays internally consistent.
    expect(computeTotals([{ hours: 1, rate: 100 }], 0.005)).toEqual({ subtotal: 100, discount: 0.01, total: 99.99 })
  })
  it('sums rounded line amounts so lines add up to the subtotal', () => {
    // Each 0.25 × 12.5 = 3.125 → prints 3.13; line amounts are rounded before
    // summing, so the two lines total 6.26, not round(6.25) = 6.25.
    expect(
      computeTotals([
        { hours: 0.25, rate: 12.5 },
        { hours: 0.25, rate: 12.5 },
      ]),
    ).toEqual({
      subtotal: 6.26,
      discount: 0,
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
  it('degrades a malformed currency code to a plain number instead of throwing', () => {
    // A non-well-formed code makes Intl.NumberFormat throw; the catch falls back
    // to "<amount> <currency>" with the default 2 decimals rather than a 502.
    expect(formatMoney(1234, 'BADCUR')).toBe('1234.00 BADCUR')
  })
})

describe('convertMoney', () => {
  it('multiplies by the rate and rounds to the target minor unit', () => {
    expect(convertMoney(100, 3.67, 'AED')).toBe(367)
    // KWD is a 3-decimal currency, so the target rounding keeps fils.
    expect(convertMoney(100, 0.002685, 'KWD')).toBe(0.269)
  })
})

describe('totalByCurrency', () => {
  const row = (total: number, currency: string, voided = false) => ({ total, currency, voided })

  it('sums non-void rows per currency into one string', () => {
    const s = totalByCurrency([row(1200, 'INR'), row(50, 'USD'), row(300, 'INR')])
    expect(s).toContain('1,500') // 1200 + 300 INR
    expect(s).toContain('50')
    expect(s).toContain(' + ')
  })

  it('excludes voided rows from the totals', () => {
    const s = totalByCurrency([row(1200, 'INR'), row(999, 'INR', true)])
    expect(s).toContain('1,200')
    expect(s).not.toContain('2,199')
  })

  it('renders a dash when every row is void or the list is empty', () => {
    expect(totalByCurrency([])).toBe(EMPTY_MONEY)
    expect(totalByCurrency([row(999, 'INR', true)])).toBe(EMPTY_MONEY)
  })
})

describe('formatMoneyTotals', () => {
  it('renders each per-currency total, joined', () => {
    const s = formatMoneyTotals([
      { currency: 'INR', live_total: 800 },
      { currency: 'USD', live_total: 50 },
    ])
    expect(s).toContain('800')
    expect(s).toContain('50')
    expect(s).toContain(' + ')
  })

  it('is a dash when there are no totals', () => {
    expect(formatMoneyTotals([])).toBe(EMPTY_MONEY)
  })
})
