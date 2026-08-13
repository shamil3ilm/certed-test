import { describe, it, expect } from 'vitest'
import { convertWeeklyTime, expandSlots, type ExpandableSlot } from '@/lib/time/expand-slots'
import { formatInstant } from '@/lib/time/format'

// A Monday 09:00–10:00 slot anchored to Asia/Kolkata (UTC+5:30, no DST).
const istSlot: ExpandableSlot = {
  id: 's-ist',
  day_of_week: 1,
  start_time: '09:00',
  end_time: '10:00',
}
// A Monday 09:00–10:00 slot anchored to a DST zone (America/New_York: -05:00 winter, -04:00 summer).
const nySlot: ExpandableSlot = {
  id: 's-ny',
  day_of_week: 1,
  start_time: '09:00',
  end_time: '10:00',
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
    expect(() => expandSlots([istSlot], 'not-a-date', '2026-07-07T00:00:00Z', 'Asia/Kolkata')).toThrow('invalid range')
  })
})

// A slot may carry its OWN zone (the tutor's), independent of the anchor/academy zone.
// Each slot is expanded IN ITS OWN ZONE, so a late class stays a valid same-day
// interval in that zone and never straddles a foreign midnight.
describe('expandSlots with a per-slot timezone', () => {
  // Same Mon 09:00-10:00 wall clock, but anchored to the Gulf (Asia/Dubai, UTC+4, no DST).
  const dubaiSlot: ExpandableSlot = {
    id: 's-dxb',
    day_of_week: 1,
    start_time: '09:00',
    end_time: '10:00',
    timezone: 'Asia/Dubai',
  }

  it("uses the slot's OWN zone, not the anchor zone, for the instant", () => {
    // Dubai Mon 09:00 = 05:00 UTC. The anchor is deliberately Kolkata (which would
    // give 03:30) to prove the slot's own zone wins.
    const occ = expandSlots([dubaiSlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    expect(occ).toHaveLength(1)
    expect(occ[0].startIso).toBe('2026-07-06T05:00:00.000Z')
    expect(occ[0].endIso).toBe('2026-07-06T06:00:00.000Z')
  })

  it('falls back to the anchor zone when the slot has no timezone', () => {
    // istSlot carries no timezone -> anchor (Kolkata) -> 03:30 UTC, as before.
    const occ = expandSlots([istSlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    expect(occ[0].startIso).toBe('2026-07-06T03:30:00.000Z')
  })

  it('falls back to the anchor zone when the slot timezone is invalid', () => {
    const bad: ExpandableSlot = { ...dubaiSlot, id: 's-bad', timezone: 'Not/AZone' }
    const occ = expandSlots([bad], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    // Kolkata fallback -> 03:30 UTC (not Dubai's 05:00).
    expect(occ[0].startIso).toBe('2026-07-06T03:30:00.000Z')
  })

  it('expands each slot in its own zone within a single call', () => {
    // Kolkata Mon 09:00 = 03:30 UTC; Dubai Mon 09:00 = 05:00 UTC.
    const occ = expandSlots([istSlot, dubaiSlot], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    const byId = Object.fromEntries(occ.map((o) => [o.slotId, o.startIso]))
    expect(byId['s-ist']).toBe('2026-07-06T03:30:00.000Z')
    expect(byId['s-dxb']).toBe('2026-07-06T05:00:00.000Z')
  })

  it('keeps a late Gulf class on ITS OWN weekday (no foreign-midnight straddle)', () => {
    // Dubai Mon 23:00-23:30. In Kolkata that instant is Tue 00:30, but the slot is
    // anchored to Dubai, so it stays Monday there. Weekday match is read in Dubai.
    const lateDubai: ExpandableSlot = {
      id: 's-late',
      day_of_week: 1, // Monday, in Dubai
      start_time: '23:00',
      end_time: '23:30',
      timezone: 'Asia/Dubai',
    }
    // Dubai Mon 23:00 = 19:00 UTC; end 23:30 = 19:30 UTC.
    const occ = expandSlots([lateDubai], '2026-07-06T00:00:00Z', '2026-07-07T00:00:00Z', 'Asia/Kolkata')
    expect(occ).toHaveLength(1)
    expect(occ[0].startIso).toBe('2026-07-06T19:00:00.000Z')
    expect(occ[0].endIso).toBe('2026-07-06T19:30:00.000Z')
  })
})

// India (Asia/Kolkata, UTC+5:30) is 1.5h AHEAD of the Gulf (Asia/Dubai, UTC+4);
// neither observes DST, so the conversion is a fixed offset every week.
describe('convertWeeklyTime', () => {
  it('is identity when the zones match', () => {
    expect(convertWeeklyTime(1, '09:00', 'Asia/Kolkata', 'Asia/Kolkata')).toEqual({ dayOfWeek: 1, time: '09:00' })
  })

  it('shifts a daytime Gulf class into India time, same weekday', () => {
    // Dubai Mon 09:00 = India Mon 10:30
    expect(convertWeeklyTime(1, '09:00', 'Asia/Dubai', 'Asia/Kolkata')).toEqual({ dayOfWeek: 1, time: '10:30' })
  })

  it('shifts a daytime India class into Gulf time, same weekday', () => {
    // India Mon 09:00 = Dubai Mon 07:30
    expect(convertWeeklyTime(1, '09:00', 'Asia/Kolkata', 'Asia/Dubai')).toEqual({ dayOfWeek: 1, time: '07:30' })
  })

  it('rolls the weekday FORWARD when a late Gulf class crosses India midnight', () => {
    // Dubai Mon 23:00 = India Tue 00:30
    expect(convertWeeklyTime(1, '23:00', 'Asia/Dubai', 'Asia/Kolkata')).toEqual({ dayOfWeek: 2, time: '00:30' })
  })

  it('rolls the weekday BACKWARD when an early India class crosses Gulf midnight', () => {
    // India Mon 01:00 = Dubai Sun 23:30
    expect(convertWeeklyTime(1, '01:00', 'Asia/Kolkata', 'Asia/Dubai')).toEqual({ dayOfWeek: 0, time: '23:30' })
  })

  it('wraps Sunday->Saturday across the week boundary', () => {
    // India Sun 01:00 = Dubai Sat 23:30
    expect(convertWeeklyTime(0, '01:00', 'Asia/Kolkata', 'Asia/Dubai')).toEqual({ dayOfWeek: 6, time: '23:30' })
  })

  it('round-trips: converting there and back is the original', () => {
    for (const [day, time] of [
      [1, '09:00'],
      [1, '23:00'],
      [0, '01:00'],
      [3, '14:45'],
    ] as const) {
      const toGulf = convertWeeklyTime(day, time, 'Asia/Kolkata', 'Asia/Dubai')
      const back = convertWeeklyTime(toGulf.dayOfWeek, toGulf.time, 'Asia/Dubai', 'Asia/Kolkata')
      expect(back).toEqual({ dayOfWeek: day, time })
    }
  })

  it('passes the value through unchanged for an invalid zone', () => {
    expect(convertWeeklyTime(1, '09:00', 'Not/AZone', 'Asia/Kolkata')).toEqual({ dayOfWeek: 1, time: '09:00' })
  })
})
