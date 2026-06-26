import { describe, it, expect } from 'vitest'
import { mergeCalendar, type MergeInput } from '@/lib/calendar/merge'

const input: MergeInput = {
  slotOccurrences: [
    { slotId: 's-1', startIso: '2026-07-06T03:30:00.000Z', endIso: '2026-07-06T04:30:00.000Z' },
  ],
  slotMeta: { 's-1': { subject: 'Maths', courseId: 'c-1', location: 'Room 1' } },
  events: [
    { id: 'e-1', title: 'Holiday', event_date: '2026-07-15', start_time: null, end_time: null, course_id: null, kind: 'holiday' },
    { id: 'e-2', title: 'Extra class', event_date: '2026-07-10', start_time: '14:00', end_time: '15:00', course_id: 'c-1', kind: 'event' },
  ],
  assignments: [
    { id: 'a-1', title: 'HW 1', due_date: '2026-07-12T18:30:00.000Z', course_id: 'c-1' },
  ],
  anchorTz: 'Asia/Kolkata',
}

describe('mergeCalendar', () => {
  it('represents every source as a calendar item', () => {
    const items = mergeCalendar(input)
    const sources = new Set(items.map((i) => i.source))
    expect(sources).toEqual(new Set(['slot', 'event', 'assignment']))
    expect(items).toHaveLength(4)
  })

  it('maps a slot occurrence to a timed item with subject + location', () => {
    const slot = mergeCalendar(input).find((i) => i.source === 'slot')!
    expect(slot.title).toMatch(/Maths/)
    expect(slot.start).toBe('2026-07-06T03:30:00.000Z')
    expect(slot.end).toBe('2026-07-06T04:30:00.000Z')
    expect(slot.allDay).toBe(false)
  })

  it('maps an all-day (no-time) event to an allDay item', () => {
    const ev = mergeCalendar(input).find((i) => i.id === 'event-e-1')!
    expect(ev.allDay).toBe(true)
    expect(ev.title).toMatch(/Holiday/)
  })

  it('maps a timed event to an absolute instant in the anchor TZ', () => {
    // 14:00 IST on 2026-07-10 === 08:30 UTC.
    const ev = mergeCalendar(input).find((i) => i.id === 'event-e-2')!
    expect(ev.allDay).toBe(false)
    expect(ev.start).toBe('2026-07-10T08:30:00.000Z')
  })

  it('maps an assignment due date to a deadline item at the absolute instant', () => {
    const due = mergeCalendar(input).find((i) => i.source === 'assignment')!
    expect(due.title).toMatch(/Due: HW 1/)
    expect(due.start).toBe('2026-07-12T18:30:00.000Z')
    expect(due.allDay).toBe(false)
  })

  it('produces stable, source-prefixed ids and a kind tag', () => {
    const items = mergeCalendar(input)
    expect(items.find((i) => i.source === 'slot')!.id).toMatch(/^slot-/)
    expect(items.find((i) => i.source === 'assignment')!.id).toBe('assignment-a-1')
    expect(items.find((i) => i.id === 'event-e-1')!.kind).toBe('holiday')
  })
})
