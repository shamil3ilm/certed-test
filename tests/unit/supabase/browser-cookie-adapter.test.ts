import { describe, it, expect, afterEach, vi } from 'vitest'
import { serializeHardenedCookie, parseCookieHeader } from '@/lib/supabase/browser-cookie-adapter'

// The maxAge @supabase/ssr forces onto every browser cookie write (its
// DEFAULT_COOKIE_OPTIONS.maxAge), which R-02 is about capping.
const FOUR_HUNDRED_DAYS = 400 * 24 * 60 * 60
const THIRTY_DAYS = 30 * 24 * 60 * 60

describe('browser cookie adapter (R-02)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('caps the 400-day maxAge the library forces back to the 30-day ceiling', () => {
    // This is exactly what our setAll receives from @supabase/ssr after it re-overrides
    // maxAge to DEFAULT_COOKIE_OPTIONS.maxAge, discarding whatever we passed.
    const out = serializeHardenedCookie('sb-auth-token', 'tok', {
      maxAge: FOUR_HUNDRED_DAYS,
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    })
    expect(out).toContain(`Max-Age=${THIRTY_DAYS}`)
    expect(out).not.toContain(`Max-Age=${FOUR_HUNDRED_DAYS}`)
    // The other options are preserved, not dropped.
    expect(out).toContain('Path=/')
    expect(out).toMatch(/SameSite=Lax/i)
  })

  it('leaves a maxAge already below the ceiling untouched', () => {
    expect(serializeHardenedCookie('sb', 'v', { maxAge: 3600, path: '/' })).toContain('Max-Age=3600')
  })

  it('preserves a cookie DELETION (maxAge 0) rather than capping it to a live TTL', () => {
    expect(serializeHardenedCookie('sb', '', { maxAge: 0, path: '/' })).toContain('Max-Age=0')
  })

  it('adds Secure in production and omits it in dev/test (http localhost)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(serializeHardenedCookie('sb', 'v', { path: '/' })).toContain('Secure')
    vi.stubEnv('NODE_ENV', 'test')
    expect(serializeHardenedCookie('sb', 'v', { path: '/' })).not.toContain('Secure')
  })

  it('round-trips through the same encoder the server-written cookie uses', () => {
    const nameValue = serializeHardenedCookie('sb-auth', 'a b+c/d', { path: '/' }).split(';')[0]
    expect(parseCookieHeader(nameValue)).toEqual([{ name: 'sb-auth', value: 'a b+c/d' }])
  })

  it('parses a multi-cookie document.cookie header into name/value pairs', () => {
    expect(parseCookieHeader('sb-a=1; sb-b=2')).toEqual([
      { name: 'sb-a', value: '1' },
      { name: 'sb-b', value: '2' },
    ])
  })
})
