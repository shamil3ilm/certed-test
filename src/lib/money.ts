function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function lineAmount(hours: number, rate: number): number {
  return round2(hours * rate)
}

export function computeTotals(
  lines: { hours: number; rate: number }[],
  discount = 0,
): { subtotal: number; total: number } {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.hours * l.rate, 0))
  const total = round2(subtotal - (discount || 0))
  return { subtotal, total }
}

/** Formats an amount for display/PDF. Indian grouping; 0–2 decimals. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}
