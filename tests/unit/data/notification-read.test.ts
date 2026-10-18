import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { updateNotificationRead } from '@/lib/data/notifications'

/**
 * Opening a notification marks that ONE notification read, and only if it is yours.
 *
 * Before this existed the list offered nothing but "Mark all read": clicking a notification
 * navigated away and left it unread, so the badge never went down on its own.
 *
 * The predicates are the behaviour, so they are what is asserted. `profile_id` in particular is
 * the authority and not a nicety - the id travels in a form field, and without it anyone who
 * could guess an id could mark somebody else's notification read.
 */
beforeEach(() => vi.resetAllMocks())

describe('updateNotificationRead', () => {
  it('scopes the write to the owner as well as the id', async () => {
    const { builder, client } = makeClientCapturing({ data: null, error: null })
    vi.mocked(createClient).mockResolvedValue(client as never)

    await updateNotificationRead('me-1', 'note-1', '2026-10-18T10:00:00.000Z')

    // One table touched, so the predicate assertions below describe that one query.
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(builder.eq).toHaveBeenCalledWith('id', 'note-1')
    expect(builder.eq).toHaveBeenCalledWith('profile_id', 'me-1')
  })

  it('stamps the timestamp it was given, and only on an unread row', async () => {
    const { builder, client } = makeClientCapturing({ data: null, error: null })
    vi.mocked(createClient).mockResolvedValue(client as never)

    await updateNotificationRead('me-1', 'note-1', '2026-10-18T10:00:00.000Z')

    expect(builder.update).toHaveBeenCalledWith({ read_at: '2026-10-18T10:00:00.000Z' })
    // Re-opening a notification must not move the timestamp of when it was first read.
    expect(builder.is).toHaveBeenCalledWith('read_at', null)
  })

  it('throws on a write error rather than reporting success', async () => {
    const { client } = makeClientCapturing({ data: null, error: { message: 'boom' } })
    vi.mocked(createClient).mockResolvedValue(client as never)

    await expect(updateNotificationRead('me-1', 'note-1', 'now')).rejects.toThrow(/updateRead/)
  })
})
