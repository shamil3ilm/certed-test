import { describe, it, expect } from 'vitest'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'

describe('rateLimit', () => {
  it('allows up to the limit then blocks within the window', () => {
    const opts = { limit: 3, windowMs: 1000 }
    expect(rateLimit('t:a', opts, 1000).ok).toBe(true)
    expect(rateLimit('t:a', opts, 1000).ok).toBe(true)
    expect(rateLimit('t:a', opts, 1000).ok).toBe(true)
    const blocked = rateLimit('t:a', opts, 1000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })
  it('resets after the window elapses', () => {
    const opts = { limit: 1, windowMs: 1000 }
    expect(rateLimit('t:b', opts, 5000).ok).toBe(true)
    expect(rateLimit('t:b', opts, 5500).ok).toBe(false) // same window
    expect(rateLimit('t:b', opts, 6000).ok).toBe(true) // window elapsed → new bucket
  })
  it('tracks keys independently', () => {
    const opts = { limit: 1, windowMs: 1000 }
    expect(rateLimit('t:k1', opts, 100).ok).toBe(true)
    expect(rateLimit('t:k2', opts, 100).ok).toBe(true)
    expect(rateLimit('t:k1', opts, 100).ok).toBe(false)
  })
})

describe('clientIp', () => {
  it('takes the first x-forwarded-for hop', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4')
  })
  it('falls back to x-real-ip, then unknown', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
    expect(clientIp(new Headers())).toBe('unknown')
  })
})
