import { describe, it, expect } from 'vitest'
import { createSlotSchema, updateSlotSchema } from '@/lib/validation/timetableSlot'

const base = {
  class_id: '11111111-1111-4111-8111-111111111111',
  subject: 'Maths',
  teacher_id: '22222222-2222-4222-8222-222222222222',
  day_of_week: 1,
  start_time: '09:00',
  end_time: '10:00',
  mode_or_location: 'Room 1',
}

describe('createSlotSchema', () => {
  it('accepts a valid slot', () => {
    expect(createSlotSchema.safeParse(base).success).toBe(true)
  })
  it('accepts a slot without a teacher or location', () => {
    const { teacher_id, mode_or_location, ...rest } = base
    expect(createSlotSchema.safeParse(rest).success).toBe(true)
  })
  it('rejects a non-uuid class_id', () => {
    expect(createSlotSchema.safeParse({ ...base, class_id: 'nope' }).success).toBe(false)
  })
  it('rejects day_of_week out of 0..6', () => {
    expect(createSlotSchema.safeParse({ ...base, day_of_week: 7 }).success).toBe(false)
    expect(createSlotSchema.safeParse({ ...base, day_of_week: -1 }).success).toBe(false)
  })
  it('rejects a non HH:mm start_time', () => {
    expect(createSlotSchema.safeParse({ ...base, start_time: '9am' }).success).toBe(false)
  })
  it('rejects end_time not after start_time', () => {
    expect(createSlotSchema.safeParse({ ...base, start_time: '10:00', end_time: '09:00' }).success).toBe(false)
    expect(createSlotSchema.safeParse({ ...base, start_time: '10:00', end_time: '10:00' }).success).toBe(false)
  })
})

describe('updateSlotSchema', () => {
  it('allows a partial update (subject only)', () => {
    expect(updateSlotSchema.safeParse({ subject: 'Physics' }).success).toBe(true)
  })
  it('allows deactivating via active=false', () => {
    expect(updateSlotSchema.safeParse({ active: false }).success).toBe(true)
  })
  it('still rejects an out-of-range day_of_week', () => {
    expect(updateSlotSchema.safeParse({ day_of_week: 9 }).success).toBe(false)
  })
})
