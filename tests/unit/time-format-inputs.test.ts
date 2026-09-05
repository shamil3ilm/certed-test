import { describe, it, expect } from 'vitest'
import { isoToDatetimeLocal, isoToLocalTime, localTimeToIso, formatMonthLabel } from '@/lib/time/format'

// Build the fixture from LOCAL components so the round-trip is timezone-independent:
// the helpers read/emit local time, and toISOString()/parse convert consistently.
const localInstant = new Date(2026, 0, 15, 9, 30, 0) // 2026-01-15 09:30 local
const iso = localInstant.toISOString()

describe('isoToDatetimeLocal', () => {
  it('formats an ISO instant as a datetime-local value', () => {
    expect(isoToDatetimeLocal(iso)).toBe('2026-01-15T09:30')
  })
  it('returns "" for an invalid ISO', () => {
    expect(isoToDatetimeLocal('not-a-date')).toBe('')
  })
})

describe('isoToLocalTime', () => {
  it('formats an ISO instant as local HH:mm', () => {
    expect(isoToLocalTime(iso)).toBe('09:30')
  })
  it('returns "" for null / undefined / empty / invalid', () => {
    expect(isoToLocalTime(null)).toBe('')
    expect(isoToLocalTime(undefined)).toBe('')
    expect(isoToLocalTime('')).toBe('')
    expect(isoToLocalTime('nope')).toBe('')
  })
})

describe('localTimeToIso', () => {
  it('combines a date + HH:mm into an ISO instant (inverse of isoToLocalTime)', () => {
    expect(localTimeToIso('2026-01-15', '09:30')).toBe(iso)
  })
  it('returns "" for a missing or invalid time', () => {
    expect(localTimeToIso('2026-01-15', '')).toBe('')
    expect(localTimeToIso('2026-01-15', 'bad')).toBe('')
  })
})

/**
 * A month label is a CALENDAR month, not an instant. Both the teaching-hours and
 * session-timings pages previously carried their own identical copy of this, hard-coded
 * to en-US while the rest of the app formats en-GB.
 */
describe('formatMonthLabel', () => {
  it('renders a YYYY-MM as a month and year', () => {
    expect(formatMonthLabel('2026-08')).toBe('August 2026')
  })

  it('does not slide back a month when the runtime zone is behind UTC', () => {
    // '2026-08-01T00:00:00Z' is 31 July in any negative-offset zone; pinning UTC is
    // what stops the label reading "July 2026" for those viewers.
    expect(formatMonthLabel('2026-01')).toBe('January 2026')
    expect(formatMonthLabel('2026-12')).toBe('December 2026')
  })

  it('returns an empty string for a malformed month rather than throwing', () => {
    expect(formatMonthLabel('not-a-month')).toBe('')
  })
})
