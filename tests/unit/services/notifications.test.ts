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
vi.mock('@/lib/data/notification-mutes', () => ({ selectMutedProfileIds: vi.fn(async () => new Set<string>()) }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))
vi.mock('@/lib/data/mentorships', () => ({
  selectActiveMentorshipsForStudents: vi.fn(),
  selectActiveMentorIdsForStudent: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getClassMembers } from '@/lib/services/classes'
import { emailEnabled, sendEmail } from '@/lib/email/resend'
import { getProfilesByIds } from '@/lib/services/users'
import { enqueuePendingEmails } from '@/lib/data/pending-emails'
import { selectActiveMentorIdsForStudent, selectActiveMentorshipsForStudents } from '@/lib/data/mentorships'
import { selectMutedProfileIds } from '@/lib/data/notification-mutes'
import { logError } from '@/lib/observability/log'
import {
  notify,
  notifyBestEffort,
  notifyClassRoleBestEffort,
  notifyMentorsOfStudentBestEffort,
  countUnreadNotifications,
  markAllNotificationsRead,
} from '@/lib/services/notifications'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectMutedProfileIds).mockResolvedValue(new Set())
})

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

/**
 * Muting is read once, in the one function that writes notifications, so the in-app row and the
 * email it mirrors go quiet together. What can never be muted must never even be asked about.
 */
describe('notify - people who muted the kind', () => {
  const insertedIds = (client: ReturnType<typeof makeClient>) =>
    (client.from.mock.results[0].value.insert.mock.calls[0][0] as { profile_id: string }[]).map((r) => r.profile_id)

  it('skips the people who muted this kind and still notifies the rest', async () => {
    vi.mocked(selectMutedProfileIds).mockResolvedValue(new Set(['b']))
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await notify(['a', 'b', 'c'], { kind: 'grade', title: 'x' })
    expect(selectMutedProfileIds).toHaveBeenCalledWith('grade', ['a', 'b', 'c'])
    expect(insertedIds(client)).toEqual(['a', 'c'])
  })

  it('writes nothing when everyone has muted it', async () => {
    vi.mocked(selectMutedProfileIds).mockResolvedValue(new Set(['a']))
    await notify(['a'], { kind: 'grade', title: 'x' })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('asks under the mute key when it is not the kind - a mentor can silence only the routine present notice', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await notify(['a'], { kind: 'attendance', muteKey: 'attendance_present', title: 'x' })
    expect(selectMutedProfileIds).toHaveBeenCalledWith('attendance_present', ['a'])
  })

  it.each(['account', 'security', 'finance', 'mentorship'] as const)(
    'never even asks about a %s notice - it cannot be muted',
    async (kind) => {
      vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as any)
      await notify(['a'], { kind, title: 'x' })
      expect(selectMutedProfileIds).not.toHaveBeenCalled()
    },
  )

  it('keeps the email quiet for a muted recipient too', async () => {
    vi.mocked(selectMutedProfileIds).mockResolvedValue(new Set(['b']))
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as any)
    vi.mocked(emailEnabled).mockReturnValue(true)
    vi.mocked(getProfilesByIds).mockResolvedValue(new Map([['a', { id: 'a', email: 'a@test.dev' }]]) as any)
    await notify(['a', 'b'], { kind: 'message', title: 'Hi' })
    expect(getProfilesByIds).toHaveBeenCalledWith(['a'])
  })

  it('delivers when the preference cannot be read - a notice nobody muted must not be lost', async () => {
    vi.mocked(selectMutedProfileIds).mockRejectedValue(new Error('boom'))
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await notify(['a'], { kind: 'grade', title: 'x' })
    expect(insertedIds(client)).toEqual(['a'])
    expect(logError).toHaveBeenCalledWith('notify.mutes', expect.any(Error), expect.anything(), expect.anything())
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

  it('reaches students, tutors and the mentors of the students once each, leaving out whoever acted', async () => {
    vi.mocked(getClassMembers).mockResolvedValue({
      tutors: [{ id: 't-1' }, { id: 'm-1' }],
      students: [{ id: 's-1' }],
    } as any)
    // m-1 is both a tutor of the class and the student's mentor: told once.
    vi.mocked(selectActiveMentorshipsForStudents).mockResolvedValue([
      { student_id: 's-1', mentor_id: 'm-1' },
      { student_id: 's-1', mentor_id: 'm-2' },
    ] as any)
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await notifyClassRoleBestEffort(
      'class-1',
      ['students', 'tutors', 'mentors'],
      { kind: 'schedule', title: 'x' },
      't-1',
    )
    expect(selectActiveMentorshipsForStudents).toHaveBeenCalledWith(['s-1'])
    const builder = client.from.mock.results[0].value
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ profile_id: 's-1' }),
      expect.objectContaining({ profile_id: 'm-1' }),
      expect.objectContaining({ profile_id: 'm-2' }),
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

describe('notifyMentorsOfStudentBestEffort', () => {
  it("tells each of the student's mentors, in words that name the student", async () => {
    vi.mocked(selectActiveMentorIdsForStudent).mockResolvedValue(['m-1', 'm-2'])
    vi.mocked(getProfilesByIds).mockResolvedValue(new Map([['s-1', { id: 's-1', full_name: 'Sara' }]]) as any)
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await notifyMentorsOfStudentBestEffort('s-1', (name) => ({ kind: 'grade', title: `${name}'s work was graded` }))
    const builder = client.from.mock.results[0].value
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ profile_id: 'm-1', title: "Sara's work was graded" }),
      expect.objectContaining({ profile_id: 'm-2', title: "Sara's work was graded" }),
    ])
  })

  it('does nothing for a student with no mentor', async () => {
    vi.mocked(selectActiveMentorIdsForStudent).mockResolvedValue([])
    await notifyMentorsOfStudentBestEffort('s-1', () => ({ kind: 'grade', title: 'x' }))
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('swallows a lookup failure - the grade or attendance is already saved', async () => {
    vi.mocked(selectActiveMentorIdsForStudent).mockRejectedValue(new Error('boom'))
    await expect(
      notifyMentorsOfStudentBestEffort('s-1', () => ({ kind: 'grade', title: 'x' })),
    ).resolves.toBeUndefined()
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
