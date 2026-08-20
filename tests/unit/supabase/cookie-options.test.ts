import { describe, it, expect, afterEach, vi } from 'vitest'
import { hardenCookieOptions } from '@/lib/supabase/cookie-options'

afterEach(() => vi.unstubAllEnvs())

describe('hardenCookieOptions', () => {
  it('marks the cookie Secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(hardenCookieOptions({ maxAge: 100 }).secure).toBe(true)
  })

  it('does NOT mark it Secure outside production (dev/E2E serve over http)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(hardenCookieOptions({ maxAge: 100 }).secure).toBe(false)
  })

  it("caps the library's 400-day maxAge to the 30-day ceiling", () => {
    const fourHundredDays = 400 * 24 * 60 * 60
    const thirtyDays = 30 * 24 * 60 * 60
    expect(hardenCookieOptions({ maxAge: fourHundredDays }).maxAge).toBe(thirtyDays)
  })

  it('preserves maxAge: 0 so cookie deletions still expire immediately', () => {
    expect(hardenCookieOptions({ maxAge: 0 }).maxAge).toBe(0)
  })

  it('leaves a maxAge already under the ceiling untouched', () => {
    expect(hardenCookieOptions({ maxAge: 3600 }).maxAge).toBe(3600)
  })

  it('passes other options through and never sets httpOnly (browser client reads the cookie)', () => {
    const out = hardenCookieOptions({ maxAge: 10, sameSite: 'lax', path: '/' })
    expect(out.sameSite).toBe('lax')
    expect(out.path).toBe('/')
    expect('httpOnly' in out).toBe(false)
  })
})
