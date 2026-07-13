import { describe, it, expect } from 'vitest'
import { isCalendarDate } from '@/lib/time/format'

describe('isCalendarDate', () => {
  it('accepts real calendar dates (incl. leap day)', () => {
    expect(isCalendarDate('2026-07-13')).toBe(true)
    expect(isCalendarDate('2024-02-29')).toBe(true) // 2024 is a leap year
  })
  it('rejects rolled-over invalid days that Date.parse would accept', () => {
    expect(isCalendarDate('2026-04-31')).toBe(false) // April has 30 days
    expect(isCalendarDate('2026-06-31')).toBe(false)
    expect(isCalendarDate('2025-02-29')).toBe(false) // 2025 is not a leap year
  })
  it('rejects out-of-range months', () => {
    expect(isCalendarDate('2026-13-01')).toBe(false)
    expect(isCalendarDate('2026-00-10')).toBe(false)
  })
  it('rejects malformed strings', () => {
    expect(isCalendarDate('13-07-2026')).toBe(false)
    expect(isCalendarDate('2026-7-1')).toBe(false)
    expect(isCalendarDate('')).toBe(false)
    expect(isCalendarDate('garbage')).toBe(false)
  })
})
