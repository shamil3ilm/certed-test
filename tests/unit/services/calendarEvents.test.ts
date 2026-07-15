import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/permission', () => ({ canWriteClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { canWriteClass } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'
import { createEvent, updateEvent, deleteEvent } from '@/lib/services/calendarEvents'
import { PermissionError, NotFoundError } from '@/lib/errors'

const teacher = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
const eventRow = {
  id: 'evt-1', title: 'Class', description: null, event_date: '2026-07-20',
  start_time: null, end_time: null, class_id: 'class-1', kind: 'event',
  slot_id: null, created_by: 'teacher-1', created_at: 't',
}

beforeEach(() => vi.resetAllMocks())

describe('createEvent', () => {
  it('rejects a caller who cannot write to the class, without a DB write or audit', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(
      createEvent(teacher, { title: 'x', event_date: '2026-07-20', class_id: 'class-1', kind: 'event' } as any),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('creates and audits event.create', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    const created = await createEvent(teacher, { title: 'Class', event_date: '2026-07-20', class_id: 'class-1', kind: 'event' } as any)
    expect(created.id).toBe('evt-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'event.create', entity_type: 'calendar_event', entity_id: 'evt-1',
    })
  })
})

describe('updateEvent', () => {
  it('throws NotFoundError for a missing id, without a permission check', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(updateEvent(teacher, 'missing', {} as any)).rejects.toBeInstanceOf(NotFoundError)
    expect(canWriteClass).not.toHaveBeenCalled()
  })

  it('rejects a non-manager of the event\'s own class, without writing/auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(updateEvent(teacher, 'evt-1', { title: 'New' } as any)).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('re-authorizes the DESTINATION class on a move, not just the source', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    vi.mocked(canWriteClass)
      .mockResolvedValueOnce(true) // source class: ok
      .mockResolvedValueOnce(false) // destination class: not ok
    await expect(
      updateEvent(teacher, 'evt-1', { class_id: 'other-class' } as any),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(canWriteClass).toHaveBeenNthCalledWith(2, teacher, 'other-class')
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('audits event.move when class_id changes, event.update otherwise', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: { ...eventRow, class_id: 'other-class' }, error: null }) as any)
    await updateEvent(teacher, 'evt-1', { class_id: 'other-class' } as any)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'event.move', entity_type: 'calendar_event', entity_id: 'evt-1',
    })

    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    await updateEvent(teacher, 'evt-1', { title: 'New title' } as any)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'event.update', entity_type: 'calendar_event', entity_id: 'evt-1',
    })
  })
})

describe('deleteEvent', () => {
  it('throws NotFoundError for a missing id', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(deleteEvent(teacher, 'missing')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deletes and audits event.delete', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: eventRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await deleteEvent(teacher, 'evt-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'event.delete', entity_type: 'calendar_event', entity_id: 'evt-1',
    })
  })
})
