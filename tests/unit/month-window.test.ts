import { describe, it, expect } from 'vitest'
import { monthWindow, isMonth } from '@/lib/time/month-window'

describe('isMonth', () => {
  it('accepts a well-formed YYYY-MM', () => {
    expect(isMonth('2026-08')).toBe(true)
    expect(isMonth('2026-01')).toBe(true)
    expect(isMonth('2026-12')).toBe(true)
  })
  it('rejects a bad month value', () => {
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth('2026-00')).toBe(false)
    expect(isMonth('2026-8')).toBe(false)
    expect(isMonth('2026-08-01')).toBe(false)
    expect(isMonth('')).toBe(false)
  })
})

describe('monthWindow', () => {
  it('uses the LOCAL month edge in a +05:30 zone (Asia/Kolkata)', () => {
    // Aug 1 00:00 IST is Jul 31 18:30 UTC; Sep 1 00:00 IST is Aug 31 18:30 UTC.
    const w = monthWindow('2026-08', 'Asia/Kolkata')
    expect(w.startIso).toBe('2026-07-31T18:30:00.000Z')
    expect(w.endIso).toBe('2026-08-31T18:30:00.000Z')
    expect(w.month).toBe('2026-08')
  })

  it('is exact UTC midnight in a zero-offset zone', () => {
    const w = monthWindow('2026-08', 'UTC')
    expect(w.startIso).toBe('2026-08-01T00:00:00.000Z')
    expect(w.endIso).toBe('2026-09-01T00:00:00.000Z')
  })

  it('rolls December into the next year for the exclusive end', () => {
    const w = monthWindow('2026-12', 'UTC')
    expect(w.startIso).toBe('2026-12-01T00:00:00.000Z')
    expect(w.endIso).toBe('2027-01-01T00:00:00.000Z')
  })

  it('handles a leap February (end is March 1st, not Feb 29th)', () => {
    const w = monthWindow('2024-02', 'UTC')
    expect(w.startIso).toBe('2024-02-01T00:00:00.000Z')
    expect(w.endIso).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to the display zone for an invalid IANA zone rather than throwing', () => {
    const bad = monthWindow('2026-08', 'Not/AZone')
    const kolkata = monthWindow('2026-08', 'Asia/Kolkata')
    expect(bad).toEqual(kolkata)
  })

  it('throws only on a malformed month', () => {
    expect(() => monthWindow('2026-13', 'UTC')).toThrow()
    expect(() => monthWindow('August', 'UTC')).toThrow()
  })
})
