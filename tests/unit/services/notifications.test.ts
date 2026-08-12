import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ getClassMembers: vi.fn() }))
// Email is OFF by default (as in the test env), so the existing cases exercise
// only the in-app insert path; the enqueue case flips emailEnabled on.
vi.mock('@/lib/email/resend', () => ({
  emailEnabled: vi.fn(() => false),
  sendEmail: vi.fn(),
  escapeHtml: (s: string) => s,
}))
vi.mock('@/lib/services/users', () => ({ getProfilesByIds: vi.fn() }))
vi.mock('@/lib/data/pending-emails', () => ({ enqueuePendingEmails: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getClassMembers } from '@/lib/services/classes'
import { emailEnabled, sendEmail } from '@/lib/email/resend'
import { getProfilesByIds } from '@/lib/services/users'
import { enqueuePendingEmails } from '@/lib/data/pending-emails'
import {
  notify,
  notifyBestEffort,
  notifyClassRoleBestEffort,
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

  it('with email enabled, QUEUES one rendered email per recipient (no inline Resend fan-out)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as any)
    vi.mocked(emailEnabled).mockReturnValue(true)
    vi.mocked(getProfilesByIds).mockResolvedValue(
      new Map([
        ['a', { id: 'a', email: 'a@test.dev' }],
        ['b', { id: 'b', email: 'b@test.dev' }],
      ]) as any,
    )

    await notify(['a', 'b'], { kind: 'message', title: 'Hi', body: 'Body', link: '/x' })

    expect(sendEmail).not.toHaveBeenCalled() // sending is deferred to the drain
    expect(enqueuePendingEmails).toHaveBeenCalledWith([
      { to_email: 'a@test.dev', subject: 'Hi', html: expect.stringContaining('Body') },
      { to_email: 'b@test.dev', subject: 'Hi', html: expect.stringContaining('Body') },
    ])
  })

  it('notifyBestEffort swallows an insert error rather than throwing into the caller', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: { message: 'boom' } }) as any)
    await expect(notifyBestEffort(['a'], { kind: 'message', title: 'x' })).resolves.toBeUndefined()
  })
})

describe('notifyClassRoleBestEffort', () => {
  it('notifies just the chosen role from the class membership', async () => {
    vi.mocked(getClassMembers).mockResolvedValue({
      tutors: [{ id: 't-1' }, { id: 't-2' }],
      students: [{ id: 's-1' }],
    } as any)
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await notifyClassRoleBestEffort('class-1', 'tutors', { kind: 'submission', title: 'New submission' })
    expect(getClassMembers).toHaveBeenCalledWith('class-1')
    const builder = client.from.mock.results[0].value
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ profile_id: 't-1', kind: 'submission' }),
      expect.objectContaining({ profile_id: 't-2' }),
    ])
  })

  it('swallows a membership-lookup failure (best-effort - never fails the caller)', async () => {
    vi.mocked(getClassMembers).mockRejectedValue(new Error('boom'))
    await expect(
      notifyClassRoleBestEffort('class-1', 'students', { kind: 'announcement', title: 'x' }),
    ).resolves.toBeUndefined()
    expect(createAdminClient).not.toHaveBeenCalled()
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
