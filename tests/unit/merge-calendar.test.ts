import { describe, it, expect } from 'vitest'
import { mergeCalendar, type MergeInput } from '@/lib/calendar/merge'

const input: MergeInput = {
  slotOccurrences: [{ slotId: 's-1', startIso: '2026-07-06T03:30:00.000Z', endIso: '2026-07-06T04:30:00.000Z' }],
  slotMeta: { 's-1': { subject: 'Maths', classId: 'c-1', location: 'Room 1' } },
  events: [
    {
      id: 'e-1',
      title: 'Holiday',
      event_date: '2026-07-15',
      start_time: null,
      end_time: null,
      class_id: null,
      kind: 'holiday',
    },
    {
      id: 'e-2',
      title: 'Extra class',
      event_date: '2026-07-10',
      start_time: '14:00',
      end_time: '15:00',
      class_id: 'c-1',
      kind: 'event',
    },
  ],
  assignments: [
    { id: 'a-1', title: 'HW 1', due_date: '2026-07-12T18:30:00.000Z', class_id: 'c-1', type: 'assignment' },
  ],
  meets: [],
  anchorTz: 'Asia/Kolkata',
}

describe('mergeCalendar', () => {
  it('represents every source as a calendar item', () => {
    const items = mergeCalendar(input)
    const sources = new Set(items.map((i) => i.source))
    expect(sources).toEqual(new Set(['slot', 'event', 'assignment']))
    expect(items).toHaveLength(4)
  })

  it('maps a scheduled meet link to a timed "Meet:" item', () => {
    const withMeet: MergeInput = {
      ...input,
      meets: [{ id: 'm-1', title: 'Doubt session', scheduled_at: '2026-07-08T09:00:00.000Z', class_id: 'c-1' }],
    }
    const meet = mergeCalendar(withMeet).find((i) => i.source === 'meet')!
    expect(meet.id).toBe('meet-m-1')
    expect(meet.title).toBe('Meet: Doubt session')
    expect(meet.start).toBe('2026-07-08T09:00:00.000Z')
    expect(meet.allDay).toBe(false)
    expect(meet.kind).toBe('meet')
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

  it('appends the class label to every class-scoped item when classLabels is set', () => {
    const withLabels: MergeInput = {
      ...input,
      classLabels: { 'c-1': 'Rahul' },
    }
    const items = mergeCalendar(withLabels)
    // Slot, class-scoped event, and assignment all carry the student label...
    expect(items.find((i) => i.source === 'slot')!.title).toBe('Maths - Room 1 · Rahul')
    expect(items.find((i) => i.id === 'event-e-2')!.title).toBe('Extra class · Rahul')
    expect(items.find((i) => i.source === 'assignment')!.title).toBe('Due: HW 1 · Rahul')
    // ...but an academy-wide event (null class_id) has nothing to label.
    expect(items.find((i) => i.id === 'event-e-1')!.title).toBe('Holiday')
  })

  it('labels a scheduled meet with the class when classLabels is set', () => {
    const withMeet: MergeInput = {
      ...input,
      meets: [{ id: 'm-1', title: 'Doubt session', scheduled_at: '2026-07-08T09:00:00.000Z', class_id: 'c-1' }],
      classLabels: { 'c-1': 'Rahul' },
    }
    expect(mergeCalendar(withMeet).find((i) => i.source === 'meet')!.title).toBe('Meet: Doubt session · Rahul')
  })

  it('omits the class label when classLabels is not provided (a student feed)', () => {
    const items = mergeCalendar(input)
    expect(items.find((i) => i.source === 'assignment')!.title).toBe('Due: HW 1')
  })

  it('titles a sat assessment by its type ("Exam:") and carries the type through', () => {
    const withExam: MergeInput = {
      ...input,
      assignments: [
        { id: 'a-2', title: 'Midterm', due_date: '2026-07-20T04:30:00.000Z', class_id: 'c-1', type: 'exam' },
      ],
    }
    const item = mergeCalendar(withExam).find((i) => i.id === 'assignment-a-2')!
    expect(item.title).toBe('Exam: Midterm')
    expect(item.type).toBe('exam')
  })

  it('produces stable, source-prefixed ids and a kind tag', () => {
    const items = mergeCalendar(input)
    expect(items.find((i) => i.source === 'slot')!.id).toMatch(/^slot-/)
    expect(items.find((i) => i.source === 'assignment')!.id).toBe('assignment-a-1')
    expect(items.find((i) => i.id === 'event-e-1')!.kind).toBe('holiday')
  })

  // The s-1 occurrence is 2026-07-06T03:30Z === 09:00 on 2026-07-06 in IST.
  it('a cancellation naming the slot on its date suppresses that occurrence', () => {
    const withCancel: MergeInput = {
      ...input,
      events: [
        ...input.events,
        {
          id: 'e-3',
          title: 'No class (holiday)',
          event_date: '2026-07-06',
          start_time: null,
          end_time: null,
          class_id: 'c-1',
          kind: 'cancellation',
          slot_id: 's-1',
        },
      ],
    }
    const items = mergeCalendar(withCancel)
    expect(items.find((i) => i.source === 'slot')).toBeUndefined() // occurrence suppressed
    expect(items.find((i) => i.id === 'event-e-3')).toBeDefined() // cancellation note still shows
  })

  it('a reschedule naming the slot suppresses the original occurrence too', () => {
    const withReschedule: MergeInput = {
      ...input,
      events: [
        {
          id: 'e-4',
          title: 'Moved to 2pm',
          event_date: '2026-07-06',
          start_time: '14:00',
          end_time: '15:00',
          class_id: 'c-1',
          kind: 'reschedule',
          slot_id: 's-1',
        },
      ],
    }
    const items = mergeCalendar(withReschedule)
    expect(items.find((i) => i.source === 'slot')).toBeUndefined()
    expect(items.find((i) => i.id === 'event-e-4')!.start).toBe('2026-07-06T08:30:00.000Z') // shown at the new time
  })

  it('does not suppress when the cancellation is on a different date or has no slot_id', () => {
    const other: MergeInput = {
      ...input,
      events: [
        {
          id: 'e-5',
          title: 'Cancel other day',
          event_date: '2026-07-13',
          start_time: null,
          end_time: null,
          class_id: 'c-1',
          kind: 'cancellation',
          slot_id: 's-1',
        },
        {
          id: 'e-6',
          title: 'Generic note',
          event_date: '2026-07-06',
          start_time: null,
          end_time: null,
          class_id: 'c-1',
          kind: 'cancellation',
          slot_id: null,
        },
      ],
    }
    expect(mergeCalendar(other).find((i) => i.source === 'slot')).toBeDefined() // not suppressed
  })
})
