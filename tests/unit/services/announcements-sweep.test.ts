import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/announcements-sweep', () => ({ claimAnnouncementsGoingLive: vi.fn() }))
vi.mock('@/lib/data/assignments-due-sweep', () => ({ selectLiveClassIds: vi.fn() }))
vi.mock('@/lib/services/announcements/commands', () => ({ notifyClassOfPost: vi.fn() }))

import { claimAnnouncementsGoingLive } from '@/lib/data/announcements-sweep'
import { selectLiveClassIds } from '@/lib/data/assignments-due-sweep'
import { notifyClassOfPost } from '@/lib/services/announcements/commands'
import { announceScheduledAnnouncements } from '@/lib/services/announcements/sweep'

const post = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  class_id: 'class-1',
  title: 'Exam timetable',
  message: 'See the stream',
  author_id: 'tutor-1',
  publish_at: '2026-09-28T09:00:00.000Z',
  expires_at: null,
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectLiveClassIds).mockResolvedValue(new Set(['class-1']))
})

/**
 * Posting a scheduled announcement notifies nobody, so this is the only moment its class hears of
 * it. The claim has already stamped what it returns, so a skipped post is never looked at again -
 * which is why each skip has to be a decision and not an accident.
 */
describe('announceScheduledAnnouncements', () => {
  it('does nothing, and asks no further question, when no post has come due', async () => {
    vi.mocked(claimAnnouncementsGoingLive).mockResolvedValue([])

    await expect(announceScheduledAnnouncements()).resolves.toEqual({ claimed: 0, announced: 0 })
    expect(selectLiveClassIds).not.toHaveBeenCalled()
    expect(notifyClassOfPost).not.toHaveBeenCalled()
  })

  it('tells the class about a post that has come due, as new, leaving out its author', async () => {
    vi.mocked(claimAnnouncementsGoingLive).mockResolvedValue([post()])

    await expect(announceScheduledAnnouncements()).resolves.toEqual({ claimed: 1, announced: 1 })

    expect(notifyClassOfPost).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }), 'tutor-1', 'New announcement')
  })

  it('stays quiet about a post that expired before the sweep reached it', async () => {
    vi.mocked(claimAnnouncementsGoingLive).mockResolvedValue([post({ expires_at: '2026-09-28T09:30:00.000Z' })])

    await expect(announceScheduledAnnouncements()).resolves.toEqual({ claimed: 1, announced: 0 })
    expect(notifyClassOfPost).not.toHaveBeenCalled()
  })

  it('stays quiet about a post in a class that has since been archived', async () => {
    vi.mocked(claimAnnouncementsGoingLive).mockResolvedValue([post({ class_id: 'archived-class' })])

    await expect(announceScheduledAnnouncements()).resolves.toEqual({ claimed: 1, announced: 0 })
    expect(notifyClassOfPost).not.toHaveBeenCalled()
  })

  it('announces each post of a batch to its own class', async () => {
    vi.mocked(selectLiveClassIds).mockResolvedValue(new Set(['class-1', 'class-2']))
    vi.mocked(claimAnnouncementsGoingLive).mockResolvedValue([post(), post({ id: 'n2', class_id: 'class-2' })])

    await expect(announceScheduledAnnouncements()).resolves.toEqual({ claimed: 2, announced: 2 })
    expect(vi.mocked(notifyClassOfPost).mock.calls.map((c) => c[0].class_id)).toEqual(['class-1', 'class-2'])
  })
})
