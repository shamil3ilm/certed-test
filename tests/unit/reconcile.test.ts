import { describe, it, expect } from 'vitest'
import { isStalePending } from '@/lib/uploads/reconcile'

const HOUR = 3_600_000
const now = 1_000_000_000_000

describe('isStalePending', () => {
  it('is stale when older than the max age', () => {
    const created = new Date(now - 7 * HOUR).toISOString()
    expect(isStalePending(created, now, 6)).toBe(true)
  })
  it('is not stale when within the max age', () => {
    const created = new Date(now - 1 * HOUR).toISOString()
    expect(isStalePending(created, now, 6)).toBe(false)
  })
  it('is not stale exactly at the boundary', () => {
    const created = new Date(now - 6 * HOUR).toISOString()
    expect(isStalePending(created, now, 6)).toBe(false)
  })
  it('handles an unparseable date safely (not stale)', () => {
    expect(isStalePending('not-a-date', now)).toBe(false)
  })
})
