import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ canWriteClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: vi.fn() }))

import { canWriteClass } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/data/audit'
import { getProfileById } from '@/lib/services/users'
import { rateLimit } from '@/lib/security/rate-limit'
import {
  createSlot,
  createSlotFromApiInput,
  updateSlot,
  updateSlotFromApiInput,
  deactivateSlot,
  deactivateSlotFromApiInput,
  listSlots,
  validateCreateSlotInput,
  validateUpdateSlotInput,
  validateSlotId,
} from '@/lib/services/timetable-slots'
import { PermissionError, NotFoundError, ValidationError, RateLimitError } from '@/lib/errors'

const tutor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const activeTutorProfile = { id: 'tutor-2', role: 'tutor', status: 'active' } as any
const slotRow = {
  id: 'slot-1',
  class_id: 'class-1',
  subject: 'Maths',
  tutor_id: null,
  day_of_week: 1,
  start_time: '09:00',
  end_time: '10:00',
  mode_or_location: null,
  active: true,
  created_at: 't',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(rateLimit).mockReturnValue({ ok: true, remaining: 99, retryAfterSec: 0 })
})

describe('timetable-write rate limiting', () => {
  it('throttles writes with RateLimitError before validating or authorizing', async () => {
    vi.mocked(rateLimit).mockReturnValueOnce({ ok: false, remaining: 0, retryAfterSec: 5 })
    await expect(createSlotFromApiInput(tutor, {})).rejects.toBeInstanceOf(RateLimitError)
    expect(canWriteClass).not.toHaveBeenCalled()
  })
})

describe('createSlot', () => {
  it('rejects a caller who cannot write to the class, without a DB write or audit', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(
      createSlot(tutor, {
        class_id: 'class-1',
        subject: 'x',
        day_of_week: 1,
        start_time: '09:00',
        end_time: '10:00',
      } as any),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a tutor_id that is not an active tutor', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(null)
    await expect(
      createSlot(tutor, {
        class_id: 'class-1',
        subject: 'x',
        day_of_week: 1,
        start_time: '09:00',
        end_time: '10:00',
        tutor_id: 'foreign-id',
      } as any),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('creates and audits timetable.create', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    const created = await createSlot(tutor, {
      class_id: 'class-1',
      subject: 'Maths',
      day_of_week: 1,
      start_time: '09:00',
      end_time: '10:00',
    } as any)
    expect(created.id).toBe('slot-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'timetable.create',
      entity_type: 'timetable_slot',
      entity_id: 'slot-1',
    })
  })
})

describe('updateSlot', () => {
  it('throws NotFoundError for a missing id, without a permission check', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(updateSlot(tutor, 'missing', {} as any)).rejects.toBeInstanceOf(NotFoundError)
    expect(canWriteClass).not.toHaveBeenCalled()
  })

  it("rejects a non-manager of the slot's class, without writing/auditing", async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(updateSlot(tutor, 'slot-1', { subject: 'New' } as any)).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('audits timetable.reassign when tutor_id is set, timetable.update otherwise', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(activeTutorProfile)
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...slotRow, tutor_id: 'tutor-2' }, error: null }) as any,
    )
    await updateSlot(tutor, 'slot-1', { tutor_id: 'tutor-2' } as any)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'timetable.reassign',
      entity_type: 'timetable_slot',
      entity_id: 'slot-1',
    })

    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    await updateSlot(tutor, 'slot-1', { subject: 'New subject' } as any)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'timetable.update',
      entity_type: 'timetable_slot',
      entity_id: 'slot-1',
    })
  })
})

describe('deactivateSlot', () => {
  it('throws NotFoundError for a missing id', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(deactivateSlot(tutor, 'missing')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deactivates and audits ONLY timetable.deactivate (not also timetable.update)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...slotRow, active: false }, error: null }) as any,
    )
    await deactivateSlot(tutor, 'slot-1')
    expect(writeAudit).toHaveBeenCalledTimes(1)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'timetable.deactivate',
      entity_type: 'timetable_slot',
      entity_id: 'slot-1',
    })
  })
})

describe('listSlots', () => {
  it('filters by classIds and dayOfWeek when given (the "today\'s classes" dashboard widget)', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listSlots({ classIds: ['class-1', 'class-2'], dayOfWeek: 3 })
    const builder = client.from.mock.results[0].value
    expect(builder.in).toHaveBeenCalledWith('class_id', ['class-1', 'class-2'])
    expect(builder.eq).toHaveBeenCalledWith('day_of_week', 3)
  })

  it('applies dayOfWeek 0 (Sunday) - a falsy value that must not be skipped by `!= null`', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listSlots({ dayOfWeek: 0 })
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('day_of_week', 0)
  })
})

describe('timetable slot API-input helpers', () => {
  it('validates create/update payloads and slot ids from the API layer', () => {
    expect(
      validateCreateSlotInput({
        class_id: '550e8400-e29b-41d4-a716-446655440000',
        subject: 'Maths',
        day_of_week: 1,
        start_time: '09:00',
        end_time: '10:00',
      }),
    ).toEqual({
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      subject: 'Maths',
      day_of_week: 1,
      start_time: '09:00',
      end_time: '10:00',
    })
    expect(validateUpdateSlotInput({ subject: 'New subject' })).toEqual({ subject: 'New subject' })
    expect(validateSlotId('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('rejects invalid slot payloads and ids with typed validation errors', () => {
    expect(() => validateCreateSlotInput({ class_id: 'bad', start_time: '10:00', end_time: '09:00' })).toThrow(
      ValidationError,
    )
    expect(() => validateSlotId('bad')).toThrow(ValidationError)
  })

  it('delegates create/update/deactivate API input through the service boundary', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    const created = await createSlotFromApiInput(tutor, {
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      subject: 'Maths',
      day_of_week: 1,
      start_time: '09:00',
      end_time: '10:00',
    })
    expect(created.id).toBe('slot-1')

    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...slotRow, id: '550e8400-e29b-41d4-a716-446655440000' }, error: null }) as any,
    )
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: slotRow, error: null }) as any)
    await updateSlotFromApiInput(tutor, '550e8400-e29b-41d4-a716-446655440000', { subject: 'New subject' })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'tutor-1',
      action: 'timetable.update',
      entity_type: 'timetable_slot',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })

    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...slotRow, id: '550e8400-e29b-41d4-a716-446655440000' }, error: null }) as any,
    )
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...slotRow, active: false }, error: null }) as any,
    )
    await deactivateSlotFromApiInput(tutor, '550e8400-e29b-41d4-a716-446655440000')
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'tutor-1',
      action: 'timetable.deactivate',
      entity_type: 'timetable_slot',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })
  })
})
