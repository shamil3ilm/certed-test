import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import {
  createReminderFromActionInput,
  listMyReminders,
  listMyPastReminders,
  markReminderSent,
  validateCreateReminderInput,
} from '@/lib/services/reminders'
import { ValidationError } from '@/lib/errors'

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
  it('updates is_sent to true for the given id', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await markReminderSent('rem-1')
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith({ is_sent: true })
    expect(builder.eq).toHaveBeenCalledWith('id', 'rem-1')
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
