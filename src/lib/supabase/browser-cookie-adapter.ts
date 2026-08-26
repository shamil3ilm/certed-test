import { parse, serialize, type SerializeOptions } from 'cookie'
import { hardenCookieOptions } from './cookie-options'

/**
 * The browser Supabase client's cookie read/write, split out so the R-02 hardening is
 * unit-testable.
 *
 * @supabase/ssr rebuilds the write options as
 *   { ...DEFAULT_COOKIE_OPTIONS, ...cookieOptions, maxAge: DEFAULT_COOKIE_OPTIONS.maxAge }
 * hard-overriding maxAge back to its 400-day default AFTER our cookieOptions spread, so
 * passing `cookieOptions.maxAge` is silently discarded (only `secure` survives). We own
 * the write instead and re-apply hardenCookieOptions here - Secure in production and the
 * 30-day inactivity ceiling - using the SAME `cookie` parse/serialize the library's own
 * document.cookie adapter uses, so the encoding matches the server-written cookie exactly.
 */

/** Serialize one cookie with the maxAge cap + Secure re-applied. Pure (no `document`),
 *  so the cap can be asserted directly. */
export function serializeHardenedCookie(name: string, value: string, options: SerializeOptions): string {
  // The cast adds the index signature hardenCookieOptions' constraint wants; a cookie
  // SerializeOptions is structurally a superset of what it reads (maxAge, secure).
  return serialize(name, value, hardenCookieOptions(options as SerializeOptions & Record<string, unknown>))
}

/** Parse a raw `document.cookie` header into the {name,value}[] shape the client wants. */
export function parseCookieHeader(header: string): { name: string; value: string }[] {
  const parsed = parse(header)
  return Object.keys(parsed).map((name) => ({ name, value: parsed[name] ?? '' }))
}
