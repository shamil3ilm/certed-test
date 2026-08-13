import { describe, it, expect } from 'vitest'
import { isoToDatetimeLocal, isoToLocalTime, localTimeToIso } from '@/lib/time/format'

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
