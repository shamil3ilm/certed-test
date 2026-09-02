import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import {
  createReminderFromActionInput,
  editReminderFromActionInput,
  listMyReminders,
  listMyPastReminders,
  markReminderSent,
  validateCreateReminderInput,
} from '@/lib/services/reminders'
import { PermissionError, ValidationError } from '@/lib/errors'

beforeEach(() => vi.resetAllMocks())

describe('listMyReminders', () => {
  it('filters to unsent reminders for the given user', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listMyReminders('user-1')
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(builder.eq).toHaveBeenCalledWith('is_sent', false)
  })
})

describe('listMyPastReminders', () => {
  it('filters to sent reminders, newest remind_at first, capped at limit', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listMyPastReminders('user-1', 5)
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(builder.eq).toHaveBeenCalledWith('is_sent', true)
    expect(builder.order).toHaveBeenCalledWith('remind_at', { ascending: false })
    expect(builder.limit).toHaveBeenCalledWith(5)
  })
})

describe('markReminderSent', () => {
  it('updates is_sent + completed_at for the given id (owner of a personal reminder)', async () => {
    const partiesClient = makeClient({ data: { user_id: 'user-1', created_by: 'user-1' }, error: null })
    const updateClient = makeClient({ data: null, error: null })
    vi.mocked(createClient)
      .mockResolvedValueOnce(partiesClient as any)
      .mockResolvedValueOnce(updateClient as any)
    await markReminderSent('user-1', 'rem-1')
    const builder = updateClient.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith({ is_sent: true, completed_at: expect.any(String) })
    expect(builder.eq).toHaveBeenCalledWith('id', 'rem-1')
  })

  it('lets the ASSIGNEE (user_id) mark an assigned reminder done', async () => {
    // assigned: created_by is the tutor, user_id is the student marking it done
    const partiesClient = makeClient({ data: { user_id: 'student', created_by: 'tutor' }, error: null })
    const updateClient = makeClient({ data: null, error: null })
    vi.mocked(createClient)
      .mockResolvedValueOnce(partiesClient as any)
      .mockResolvedValueOnce(updateClient as any)
    await markReminderSent('student', 'rem-1')
    expect(updateClient.from.mock.results[0].value.update).toHaveBeenCalledWith({
      is_sent: true,
      completed_at: expect.any(String),
    })
  })

  it('rejects a stranger (neither assignee nor creator) marking it done', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { user_id: 'student', created_by: 'tutor' }, error: null }) as any,
    )
    await expect(markReminderSent('someone-else', 'rem-1')).rejects.toBeInstanceOf(PermissionError)
  })
})

describe('validateCreateReminderInput', () => {
  it('trims optional description and returns the parsed reminder payload', () => {
    expect(
      validateCreateReminderInput({
        title: ' Revision ',
        description: ' Bring notebook ',
        remind_at: '2026-07-20T10:00:00.000Z',
      }),
    ).toEqual({
      title: 'Revision',
      description: 'Bring notebook',
      remind_at: '2026-07-20T10:00:00.000Z',
    })
  })

  it('throws a typed validation error for invalid reminder input', () => {
    expect(() =>
      validateCreateReminderInput({
        title: '',
        description: null,
        remind_at: 'not-a-date',
      }),
    ).toThrow(ValidationError)
  })
})

describe('createReminderFromActionInput', () => {
  it('creates a reminder from the validated action payload', async () => {
    const reminderRow = {
      id: 'rem-1',
      user_id: 'user-1',
      title: 'Revision',
      description: 'Bring notebook',
      remind_at: '2026-07-20T10:00:00.000Z',
      is_sent: false,
      created_at: '2026-07-16T00:00:00.000Z',
    }
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: reminderRow, error: null }) as any)
    const created = await createReminderFromActionInput('user-1', {
      title: ' Revision ',
      description: ' Bring notebook ',
      remind_at: '2026-07-20T10:00:00.000Z',
    })
    expect(created.title).toBe('Revision')
    expect(created.description).toBe('Bring notebook')
  })
})

describe('editReminderFromActionInput', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000'

  it('updates title/note/time after a CREATOR check (personal: owner is creator)', async () => {
    const partiesClient = makeClient({ data: { user_id: 'user-1', created_by: 'user-1' }, error: null })
    const updateClient = makeClient({ data: null, error: null })
    vi.mocked(createClient)
      .mockResolvedValueOnce(partiesClient as any)
      .mockResolvedValueOnce(updateClient as any)
    await editReminderFromActionInput('user-1', {
      id: validId,
      title: ' Revision 2 ',
      description: ' Bring notebook ',
      remind_at: '2026-07-21T10:00:00.000Z',
    })
    const builder = updateClient.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith({
      title: 'Revision 2',
      description: 'Bring notebook',
      remind_at: '2026-07-21T10:00:00.000Z',
    })
    expect(builder.eq).toHaveBeenCalledWith('id', validId)
  })

  it('lets the CREATOR edit an assigned reminder', async () => {
    const partiesClient = makeClient({ data: { user_id: 'student', created_by: 'tutor' }, error: null })
    const updateClient = makeClient({ data: null, error: null })
    vi.mocked(createClient)
      .mockResolvedValueOnce(partiesClient as any)
      .mockResolvedValueOnce(updateClient as any)
    await editReminderFromActionInput('tutor', {
      id: validId,
      title: 'Updated',
      description: null,
      remind_at: '2026-07-21T10:00:00.000Z',
    })
    expect(updateClient.from.mock.results[0].value.update).toHaveBeenCalled()
  })

  it('rejects the ASSIGNEE (student) editing an assigned reminder, without an update', async () => {
    const partiesClient = makeClient({ data: { user_id: 'student', created_by: 'tutor' }, error: null })
    vi.mocked(createClient).mockResolvedValueOnce(partiesClient as any)
    await expect(
      editReminderFromActionInput('student', {
        id: validId,
        title: 'hacked',
        description: null,
        remind_at: '2026-07-21T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(PermissionError)
  })
})
