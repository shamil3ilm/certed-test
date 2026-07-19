// The currencies the app can issue in (the finance form's dropdown + the server
// validator both read this — one source of truth so they can't drift and let an
// un-renderable currency string reach Intl.NumberFormat).
export const SUPPORTED_CURRENCIES = ['INR', 'AED', 'SAR', 'QAR', 'OMR', 'KWD', 'BHD', 'USD'] as const
export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

// Currency minor units (decimal places). Most currencies use 2; the GCC/Arab
// 3-decimal currencies (fils) and the 0-decimal ones (yen/won) must be handled
// explicitly so amounts both round and display correctly.
const MINOR_UNITS: Record<string, number> = {
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, OMR: 3, TND: 3, LYD: 3,
  JPY: 0, KRW: 0, VND: 0, CLP: 0,
}

/** Decimal places for a currency's minor unit (2 by default). */
export function currencyDecimals(currency: string): number {
  return MINOR_UNITS[(currency ?? '').toUpperCase()] ?? 2
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round((n + Number.EPSILON) * f) / f
}

export function lineAmount(hours: number, rate: number, currency = 'INR'): number {
  return roundTo(hours * rate, currencyDecimals(currency))
}

export function computeTotals(
  lines: { hours: number; rate: number }[],
  discount = 0,
  currency = 'INR',
): { subtotal: number; total: number } {
  const decimals = currencyDecimals(currency)
  // Sum the ALREADY-ROUNDED line amounts (not the raw products) so the printed
  // line amounts add up exactly to the printed subtotal — Σ round(line) rather
  // than round(Σ line), which otherwise disagree by a minor unit or two.
  const subtotal = roundTo(
    lines.reduce((sum, l) => sum + roundTo(l.hours * l.rate, decimals), 0),
    decimals,
  )
  const total = roundTo(subtotal - (discount || 0), decimals)
  return { subtotal, total }
}

/**
 * Formats an amount for display/PDF, correct for the given currency:
 *  - INR keeps Indian lakh/crore grouping (₹1,00,000); everything else uses
 *    standard thousands grouping ($100,000) instead of forcing en-IN on it.
 *  - Fraction digits follow the currency's minor unit, so KWD/BHD/OMR show fils
 *    (1.234) and JPY shows none — and every amount on one document shows the SAME
 *    number of decimals (₹1,200.00, not a mix of ₹1,200 and ₹333.33).
 *  - An unknown currency would make Intl throw; fall back to a plain number so a
 *    bad row degrades to "1,234.00 XXX" instead of a 502.
 */
export function formatMoney(amount: number, currency: string): string {
  const decimals = currencyDecimals(currency)
  const locale = (currency ?? '').toUpperCase() === 'INR' ? 'en-IN' : 'en-US'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount)
  } catch {
    return `${amount.toFixed(decimals)} ${currency}`
  }
}

/** Sums non-void finance docs per currency into one display string (e.g. "₹1,200 + $50"). */
export function totalByCurrency(
  rows: { total: number; currency: string; voided: boolean }[],
): string {
  const m = new Map<string, number>()
  rows.filter((r) => !r.voided).forEach((r) => m.set(r.currency, (m.get(r.currency) ?? 0) + Number(r.total)))
  const g = [...m.entries()]
  return g.length ? g.map(([c, t]) => formatMoney(t, c)).join(' + ') : formatMoney(0, 'INR')
}

/** Renders already-aggregated per-currency totals into one display string, with a
 *  zero fallback when there are none. Shared by the dashboard finance card and its
 *  drill-down modal (was duplicated in both). */
export function formatMoneyTotals(
  totals: ReadonlyArray<{ currency: string; live_total: number }>,
  fallback = 'INR',
): string {
  return totals.length ? totals.map((t) => formatMoney(t.live_total, t.currency)).join(' + ') : formatMoney(0, fallback)
}
