import { describe, it, expect } from 'vitest'
import { computeStatus } from '@/lib/assignments/lateStatus'

const due = '2026-06-25T18:00:00.000Z'

describe('computeStatus', () => {
  it('is submitted before due', () => {
    expect(computeStatus('2026-06-25T17:59:59.000Z', due)).toBe('submitted')
  })
  it('is submitted exactly at due (inclusive boundary)', () => {
    expect(computeStatus('2026-06-25T18:00:00.000Z', due)).toBe('submitted')
  })
  it('is late one second after due', () => {
    expect(computeStatus('2026-06-25T18:00:01.000Z', due)).toBe('late')
  })
  it('is timezone-independent (same instant via +05:30 offset)', () => {
    // 18:00:00Z === 23:30:00+05:30 — same instant, still on time
    expect(computeStatus('2026-06-25T23:30:00.000+05:30', due)).toBe('submitted')
    // 18:00:01Z === 23:30:01+05:30 — same instant, late
    expect(computeStatus('2026-06-25T23:30:01.000+05:30', due)).toBe('late')
  })
  it('fails open on an unparseable date', () => {
    expect(computeStatus('nope', due)).toBe('submitted')
  })
})
