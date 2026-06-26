import { describe, it, expect } from 'vitest'
import { expandSlots, type ExpandableSlot } from '@/lib/time/expandSlots'
import { formatInstant } from '@/lib/time/format'

// A Monday 09:00–10:00 slot anchored to Asia/Kolkata (UTC+5:30, no DST).
const istSlot: ExpandableSlot = {
  id: 's-ist', day_of_week: 1, start_time: '09:00', end_time: '10:00',
}
// A Monday 09:00–10:00 slot anchored to a DST zone (America/New_York: -05:00 winter, -04:00 summer).
const nySlot: ExpandableSlot = {
  id: 's-ny', day_of_week: 1, start_time: '09:00', end_time: '10:00',
}

describe('expandSlots', () => {
  it('expands one occurrence per matching weekday in the range', () => {
    // 2026-07-06 is a Monday; range covers exactly one Monday.
    const occ = expandSlots([istSlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    expect(occ).toHaveLength(1)
    expect(occ[0].slotId).toBe('s-ist')
  })

  it('produces the correct absolute UTC instant for an IST wall-clock time', () => {
    // 09:00 IST on Mon 2026-07-06 === 03:30 UTC.
    const occ = expandSlots([istSlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    expect(occ[0].startIso).toBe('2026-07-06T03:30:00.000Z')
    expect(occ[0].endIso).toBe('2026-07-06T04:30:00.000Z')
  })

  it('expands multiple Mondays across a multi-week range', () => {
    // 2026-07-06, 2026-07-13, 2026-07-20 are Mondays.
    const occ = expandSlots([istSlot], '2026-07-06T00:00:00Z', '2026-07-21T00:00:00Z', 'Asia/Kolkata')
    expect(occ.map((o) => o.startIso)).toEqual([
      '2026-07-06T03:30:00.000Z',
      '2026-07-13T03:30:00.000Z',
      '2026-07-20T03:30:00.000Z',
    ])
  })

  it('is DST-safe: a summer NY slot uses the -04:00 offset', () => {
    // 09:00 America/New_York on Mon 2026-07-06 (EDT, -04:00) === 13:00 UTC.
    const occ = expandSlots([nySlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'America/New_York')
    expect(occ[0].startIso).toBe('2026-07-06T13:00:00.000Z')
  })

  it('is DST-safe: a winter NY slot uses the -05:00 offset', () => {
    // 09:00 America/New_York on Mon 2026-01-05 (EST, -05:00) === 14:00 UTC.
    const occ = expandSlots([nySlot], '2026-01-05T00:00:00Z', '2026-01-06T00:00:00Z', 'America/New_York')
    expect(occ[0].startIso).toBe('2026-01-05T14:00:00.000Z')
  })

  it('the absolute instant is correct when later formatted in a DIFFERENT device TZ', () => {
    // IST slot at 09:00 IST === 03:30 UTC. Viewed in UTC it must read 03:30; in IST, 09:00.
    const occ = expandSlots([istSlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    expect(formatInstant(occ[0].startIso, 'UTC')).toMatch(/03:30/)
    expect(formatInstant(occ[0].startIso, 'Asia/Kolkata')).toMatch(/09:00/)
  })

  it('skips inactive expansion when no weekday matches the range', () => {
    // Range Tue→Wed only; no Monday inside.
    const occ = expandSlots([istSlot], '2026-07-07T00:00:00Z', '2026-07-09T00:00:00Z', 'Asia/Kolkata')
    expect(occ).toHaveLength(0)
  })

  it('throws on an unparseable range bound', () => {
    expect(() => expandSlots([istSlot], 'not-a-date', '2026-07-07T00:00:00Z', 'Asia/Kolkata'))
      .toThrow('invalid range')
  })
})
