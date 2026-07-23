import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ canWriteClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: vi.fn() }))

import { canWriteClass } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/data/audit'
import { rateLimit } from '@/lib/security/rate-limit'
import {
  createEvent,
  createEventFromApiInput,
  updateEvent,
  updateEventFromApiInput,
  deleteEvent,
  deleteEventFromApiInput,
  validateCreateEventInput,
  validateUpdateEventInput,
  validateEventId,
} from '@/lib/services/calendar-events'
import { PermissionError, NotFoundError, ValidationError, RateLimitError } from '@/lib/errors'

const tutor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const eventRow = {
  id: 'evt-1',
  title: 'Class',
  description: null,
  event_date: '2026-07-20',
  start_time: null,
  end_time: null,
  class_id: 'class-1',
  kind: 'event',
  slot_id: null,
  created_by: 'tutor-1',
  created_at: 't',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(rateLimit).mockReturnValue({ ok: true, remaining: 99, retryAfterSec: 0 })
})

describe('calendar-write rate limiting', () => {
  it('throttles writes with RateLimitError before validating or authorizing', async () => {
    vi.mocked(rateLimit).mockReturnValueOnce({ ok: false, remaining: 0, retryAfterSec: 5 })
    await expect(createEventFromApiInput(tutor, {})).rejects.toBeInstanceOf(RateLimitError)
    expect(canWriteClass).not.toHaveBeenCalled()
  })
})

describe('createEvent', () => {
  it('rejects a caller who cannot write to the class, without a DB write or audit', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(
      createEvent(tutor, { title: 'x', event_date: '2026-07-20', class_id: 'class-1', kind: 'event' } as any),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('creates and audits event.create', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    const created = await createEvent(tutor, {
      title: 'Class',
      event_date: '2026-07-20',
      class_id: 'class-1',
      kind: 'event',
    } as any)
    expect(created.id).toBe('evt-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'event.create',
      entity_type: 'calendar_event',
      entity_id: 'evt-1',
    })
  })
})

describe('updateEvent', () => {
  it('throws NotFoundError for a missing id, without a permission check', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(updateEvent(tutor, 'missing', {} as any)).rejects.toBeInstanceOf(NotFoundError)
    expect(canWriteClass).not.toHaveBeenCalled()
  })

  it("rejects a non-manager of the event's own class, without writing/auditing", async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(updateEvent(tutor, 'evt-1', { title: 'New' } as any)).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('re-authorizes the DESTINATION class on a move, not just the source', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    vi.mocked(canWriteClass)
      .mockResolvedValueOnce(true) // source class: ok
      .mockResolvedValueOnce(false) // destination class: not ok
    await expect(updateEvent(tutor, 'evt-1', { class_id: 'other-class' } as any)).rejects.toBeInstanceOf(
      PermissionError,
    )
    expect(canWriteClass).toHaveBeenNthCalledWith(2, tutor, 'other-class')
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('audits event.move when class_id changes, event.update otherwise', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...eventRow, class_id: 'other-class' }, error: null }) as any,
    )
    await updateEvent(tutor, 'evt-1', { class_id: 'other-class' } as any)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'event.move',
      entity_type: 'calendar_event',
      entity_id: 'evt-1',
    })

    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    await updateEvent(tutor, 'evt-1', { title: 'New title' } as any)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'event.update',
      entity_type: 'calendar_event',
      entity_id: 'evt-1',
    })
  })
})

describe('deleteEvent', () => {
  it('throws NotFoundError for a missing id', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(deleteEvent(tutor, 'missing')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deletes and audits event.delete', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await deleteEvent(tutor, 'evt-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'event.delete',
      entity_type: 'calendar_event',
      entity_id: 'evt-1',
    })
  })
})

describe('calendar event API-input helpers', () => {
  it('validates create/update payloads and event ids from the API layer', () => {
    expect(
      validateCreateEventInput({
        title: 'Class',
        event_date: '2026-07-20',
        class_id: '550e8400-e29b-41d4-a716-446655440000',
        kind: 'event',
      }),
    ).toEqual({
      title: 'Class',
      event_date: '2026-07-20',
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      kind: 'event',
    })
    expect(validateUpdateEventInput({ title: 'Updated' })).toEqual({ title: 'Updated' })
    expect(validateEventId('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('rejects invalid create payloads and event ids with typed validation errors', () => {
    expect(() => validateCreateEventInput({ title: '', event_date: 'bad', kind: 'event' })).toThrow(ValidationError)
    expect(() => validateEventId('bad')).toThrow(ValidationError)
  })

  it('delegates create/update/delete API input through the service boundary', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    const created = await createEventFromApiInput(tutor, {
      title: 'Class',
      event_date: '2026-07-20',
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      kind: 'event',
    })
    expect(created.id).toBe('evt-1')

    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...eventRow, id: '550e8400-e29b-41d4-a716-446655440000' }, error: null }) as any,
    )
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    await updateEventFromApiInput(tutor, '550e8400-e29b-41d4-a716-446655440000', { title: 'Updated' })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'tutor-1',
      action: 'event.update',
      entity_type: 'calendar_event',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })

    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...eventRow, id: '550e8400-e29b-41d4-a716-446655440000' }, error: null }) as any,
    )
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await deleteEventFromApiInput(tutor, '550e8400-e29b-41d4-a716-446655440000')
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'tutor-1',
      action: 'event.delete',
      entity_type: 'calendar_event',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })
  })
})
