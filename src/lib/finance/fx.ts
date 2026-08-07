/**
 * Exchange-rate resolution for the admin-managed multi-currency conversion.
 * Pure and IO-free: given the rate rows the admin has entered, pick the one that
 * applies to a document, so a document's base-currency amount is priced by ITS
 * OWN date. The conversion arithmetic itself lives in @/lib/money (convertMoney).
 */

export type ExchangeRate = {
  id: string
  currency: string
  base_currency: string
  rate: number
  /** 'YYYY-MM-DD' - the rate applies to documents dated on or after this. */
  effective_from: string
}

export type ResolvedRate = {
  /** 1 unit of the source currency in base currency. */
  rate: number
  /** The rate row used, or null for an identity conversion (currency === base). */
  rateId: string | null
}

/**
 * The rate to convert `currency` into `base` for a document dated `isoDate`
 * ('YYYY-MM-DD'): the newest rate whose `effective_from` is on or before that
 * date. A document already in the base currency converts 1:1 and needs no rate
 * row. Returns null when no entered rate covers the date - the caller leaves the
 * document unconverted rather than guessing.
 */
export function resolveRate(
  rates: ReadonlyArray<ExchangeRate>,
  currency: string,
  base: string,
  isoDate: string,
): ResolvedRate | null {
  if (currency === base) return { rate: 1, rateId: null }
  const best = rates
    .filter((r) => r.currency === currency && r.base_currency === base && r.effective_from <= isoDate)
    // ISO date strings sort lexicographically, so newest-first is a plain compare.
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0]
  return best ? { rate: best.rate, rateId: best.id } : null
}
