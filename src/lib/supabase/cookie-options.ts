/**
 * Harden the cookie options @supabase/ssr hands to our setAll callbacks before we
 * write them. The library's DEFAULT_COOKIE_OPTIONS are `secure: undefined`,
 * `httpOnly: false`, `maxAge: 400 days`; we pass them straight to the response, so
 * without this the auth cookie ships un-Secure and lives for 400 days.
 *
 * - secure: on in production (HTTPS) only - dev and the E2E build serve over http
 *   on localhost, where a Secure cookie would simply be dropped.
 * - maxAge: capped well below the 400-day default so a stolen persisted cookie
 *   has a bounded lifetime. An active session re-sets the cookie on every refresh,
 *   so this is an inactivity ceiling, not a hard logout.
 * - httpOnly is intentionally LEFT as the library default (false): the browser
 *   Supabase client (createBrowserClient, lib/supabase/client.ts) reads the session
 *   from these cookies, so making them httpOnly would break client-side auth. XSS
 *   exposure is mitigated by the per-request CSP instead (see proxy.ts).
 */

export const MAX_SESSION_SECONDS = 30 * 24 * 60 * 60 // 30 days

type HardenableCookieOptions = { maxAge?: number; secure?: boolean } & Record<string, unknown>

export function hardenCookieOptions<T extends HardenableCookieOptions>(options: T): T & { secure: boolean } {
  return {
    ...options,
    secure: process.env.NODE_ENV === 'production',
    // Preserve maxAge: 0 (the library's cookie DELETIONS); cap only positive TTLs.
    maxAge: options?.maxAge != null ? Math.min(options.maxAge, MAX_SESSION_SECONDS) : options?.maxAge,
  }
}
