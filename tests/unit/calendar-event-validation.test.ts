import { describe, it, expect } from 'vitest'
import { createEventSchema, updateEventSchema } from '@/lib/validation/calendar-event'

const base = {
  title: 'Parents meeting',
  description: 'Term 1 review',
  event_date: '2026-07-15',
  start_time: '14:00',
  end_time: '15:00',
  class_id: '11111111-1111-4111-8111-111111111111',
  kind: 'event',
}

describe('createEventSchema', () => {
  it('accepts a valid course event', () => {
    expect(createEventSchema.safeParse(base).success).toBe(true)
  })
  it('accepts a global all-day event (no course, no times)', () => {
    expect(createEventSchema.safeParse({
      title: 'Holiday', event_date: '2026-08-15', class_id: null, kind: 'holiday',
    }).success).toBe(true)
  })
  it('rejects an unknown kind', () => {
    expect(createEventSchema.safeParse({ ...base, kind: 'party' }).success).toBe(false)
  })
  it('rejects a non-ISO event_date', () => {
    expect(createEventSchema.safeParse({ ...base, event_date: '15/07/2026' }).success).toBe(false)
  })
  it('rejects an end_time without a start_time', () => {
    const { start_time, ...rest } = base
    expect(createEventSchema.safeParse(rest).success).toBe(false)
  })
  it('rejects end_time not after start_time when both given', () => {
    expect(createEventSchema.safeParse({ ...base, start_time: '15:00', end_time: '14:00' }).success).toBe(false)
  })
})

describe('updateEventSchema', () => {
  it('allows a partial update (title only)', () => {
    expect(updateEventSchema.safeParse({ title: 'Renamed' }).success).toBe(true)
  })
  it('rejects an unknown kind on update', () => {
    expect(updateEventSchema.safeParse({ kind: 'nope' }).success).toBe(false)
  })
})
