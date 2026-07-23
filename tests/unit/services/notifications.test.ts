import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  notify,
  notifyBestEffort,
  countUnreadNotifications,
  markAllNotificationsRead,
} from '@/lib/services/notifications'

beforeEach(() => vi.resetAllMocks())

describe('notify', () => {
  it('inserts one row per unique recipient', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await notify(['a', 'b', 'a'], { kind: 'message', title: 'hi', link: '/x' })
    const builder = client.from.mock.results[0].value
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ profile_id: 'a', kind: 'message', title: 'hi', link: '/x' }),
      expect.objectContaining({ profile_id: 'b' }),
    ])
  })

  it('no-ops (no DB call) for an empty recipient list', async () => {
    await notify([], { kind: 'grade', title: 'x' })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('notifyBestEffort swallows an insert error rather than throwing into the caller', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: { message: 'boom' } }) as any)
    await expect(notifyBestEffort(['a'], { kind: 'message', title: 'x' })).resolves.toBeUndefined()
  })
})

describe('countUnreadNotifications / markAllNotificationsRead', () => {
  it('counts the unread rows returned', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient({ data: [{ id: '1' }, { id: '2' }], error: null }) as any)
    await expect(countUnreadNotifications('me')).resolves.toBe(2)
  })

  it('marks all read via the RLS client', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createClient).mockResolvedValue(client as any)
    await markAllNotificationsRead({ id: 'me' } as any)
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ read_at: expect.any(String) }))
  })
})
