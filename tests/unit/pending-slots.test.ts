import { describe, it, expect } from 'vitest'
import { pendingSlots, type MarkedSession } from '@/lib/attendance/pending-slots'

// 2026-08-05 is a Wednesday (day_of_week 3). UTC keeps the arithmetic readable.
const TODAY = '2026-08-05'
const TZ = 'UTC'

const slot = (id: string, class_id: string, start_time: string, end_time: string, day_of_week = 3) => ({
  id,
  class_id,
  day_of_week,
  start_time,
  end_time,
  timezone: null,
})

const MORNING = slot('morning', 'c1', '09:00', '10:00')
const EVENING = slot('evening', 'c1', '16:00', '17:00')

const timed = (id: string, class_id: string, start: string, end: string): MarkedSession => ({
  id,
  class_id,
  actual_start: `${TODAY}T${start}:00.000Z`,
  actual_end: `${TODAY}T${end}:00.000Z`,
})
const untimed = (id: string, class_id: string): MarkedSession => ({
  id,
  class_id,
  actual_start: null,
  actual_end: null,
})

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id)

describe('pendingSlots', () => {
  it('lists every slot when nothing has been marked', () => {
    expect(ids(pendingSlots([MORNING, EVENING], [], TODAY, TZ))).toEqual(['morning', 'evening'])
  })

  it('keeps the second slot pending once only the first is marked', () => {
    // The bug: "the class has a mark today" dropped BOTH slots as soon as the morning was taken.
    const marked = [timed('s1', 'c1', '09:05', '09:55')]
    expect(ids(pendingSlots([MORNING, EVENING], marked, TODAY, TZ))).toEqual(['evening'])
  })

  it('keeps the first slot pending when only the later one is marked', () => {
    const marked = [timed('s2', 'c1', '16:00', '17:00')]
    expect(ids(pendingSlots([MORNING, EVENING], marked, TODAY, TZ))).toEqual(['morning'])
  })

  it('lists nothing once both slots are marked', () => {
    const marked = [timed('s1', 'c1', '09:00', '10:00'), timed('s2', 'c1', '16:00', '17:00')]
    expect(pendingSlots([MORNING, EVENING], marked, TODAY, TZ)).toEqual([])
  })

  it('treats a marked session with no times as the earliest open slot of its class', () => {
    expect(ids(pendingSlots([MORNING, EVENING], [untimed('s1', 'c1')], TODAY, TZ))).toEqual(['evening'])
    expect(pendingSlots([MORNING, EVENING], [untimed('s1', 'c1'), untimed('s2', 'c1')], TODAY, TZ)).toEqual([])
  })

  it('lets a session with times and one without each answer for their own slot', () => {
    const marked = [timed('s2', 'c1', '16:00', '17:00'), untimed('s1', 'c1')]
    expect(pendingSlots([MORNING, EVENING], marked, TODAY, TZ)).toEqual([])
  })

  it('does not let an extra class that fits no slot stand in for one', () => {
    const marked = [timed('extra', 'c1', '12:00', '13:00')]
    expect(ids(pendingSlots([MORNING, EVENING], marked, TODAY, TZ))).toEqual(['morning', 'evening'])
  })

  it('does not let one session answer for two slots', () => {
    // One long session across both slots is still one session.
    const marked = [timed('long', 'c1', '09:00', '17:00')]
    expect(pendingSlots([MORNING, EVENING], marked, TODAY, TZ)).toHaveLength(1)
  })

  it('keeps classes apart', () => {
    const other = slot('other', 'c2', '09:00', '10:00')
    const marked = [timed('s1', 'c1', '09:00', '10:00')]
    expect(ids(pendingSlots([MORNING, other], marked, TODAY, TZ))).toEqual(['other'])
  })

  it('falls back to the whole class for a slot with no window today', () => {
    // Anchored to a different weekday in its own zone, so it has no occurrence to match against.
    const offDay = slot('off', 'c1', '09:00', '10:00', 5)
    expect(ids(pendingSlots([offDay], [timed('s1', 'c1', '09:00', '10:00')], TODAY, TZ))).toEqual([])
    expect(ids(pendingSlots([offDay], [], TODAY, TZ))).toEqual(['off'])
  })

  it('returns nothing for no slots', () => {
    expect(pendingSlots([], [timed('s1', 'c1', '09:00', '10:00')], TODAY, TZ)).toEqual([])
  })
})
