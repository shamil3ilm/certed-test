import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/comments', () => ({ selectForEntities: vi.fn() }))
vi.mock('@/lib/data/resources', () => ({ selectResourceClassIdAsService: vi.fn() }))
vi.mock('@/lib/data/meet-links', () => ({ selectMeetLinkClassIdAsService: vi.fn() }))
vi.mock('@/lib/data/announcements', () => ({ selectAnnouncementClassIdAsService: vi.fn() }))
vi.mock('@/lib/data/submissions', () => ({ selectSubmissionOwnerAsService: vi.fn() }))
vi.mock('@/lib/data/assignments', () => ({ selectAssignmentClassIdAsService: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({
  notifyBestEffort: vi.fn(),
  notifyClassRoleBestEffort: vi.fn(),
}))
vi.mock('@/lib/services/classes', () => ({ getClassMembers: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { selectForEntities } from '@/lib/data/comments'
import { selectResourceClassIdAsService } from '@/lib/data/resources'
import { selectSubmissionOwnerAsService } from '@/lib/data/submissions'
import { selectAssignmentClassIdAsService } from '@/lib/data/assignments'
import { getClassMembers } from '@/lib/services/classes'
import { notifyBestEffort, notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { logError } from '@/lib/observability/log'
import { notifyCommentThread } from '@/lib/services/comment-notify'

beforeEach(() => vi.resetAllMocks())

/**
 * A grade notifies and a message notifies. The thread attached to the work was the one place a
 * person could be addressed directly and hear nothing.
 */
describe('notifyCommentThread - a submission has two sides', () => {
  beforeEach(() => {
    vi.mocked(selectSubmissionOwnerAsService).mockResolvedValue({
      student_id: 'stud-1',
      assignment_id: 'assign-1',
    } as never)
    vi.mocked(selectAssignmentClassIdAsService).mockResolvedValue({ class_id: 'class-1' })
  })

  it("tells the class's tutors when the student asks about their own work", async () => {
    await notifyCommentThread('submission', 'sub-1', 'stud-1', 'Is the second part needed?')

    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith('class-1', 'tutors', {
      kind: 'submission',
      title: 'New comment on a submission',
      body: 'Is the second part needed?',
      link: '/classroom/class-1/classwork',
    })
    // Never the student themselves - they are the one who just wrote it.
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('tells the student when a tutor answers', async () => {
    await notifyCommentThread('submission', 'sub-1', 'tutor-9', 'Yes - show your working.')

    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1'], {
      kind: 'submission',
      title: 'New comment on your work',
      body: 'Yes - show your working.',
      link: '/classroom/class-1/classwork',
    })
    expect(notifyClassRoleBestEffort).not.toHaveBeenCalled()
  })

  it('says nothing about a submission that no longer exists', async () => {
    vi.mocked(selectSubmissionOwnerAsService).mockResolvedValue(null)

    await notifyCommentThread('submission', 'sub-1', 'tutor-9', 'hello')

    expect(notifyBestEffort).not.toHaveBeenCalled()
  })
})

const members = (...ids: string[]) => ({ students: ids.map((id) => ({ id })), tutors: [] }) as never

describe('notifyCommentThread - a class-wide item notifies the thread, not the class', () => {
  beforeEach(() => {
    vi.mocked(selectResourceClassIdAsService).mockResolvedValue({ class_id: 'class-1' } as never)
    vi.mocked(getClassMembers).mockResolvedValue(members('stud-1', 'stud-2', 'tutor-9'))
  })

  it('notifies everyone who already spoke there, and not the author', async () => {
    // The just-inserted comment is in this set too: notification runs after the write.
    vi.mocked(selectForEntities).mockResolvedValue([
      { author_id: 'stud-1' },
      { author_id: 'tutor-9' },
      { author_id: 'stud-1' },
      { author_id: 'stud-2' },
    ] as never)

    await notifyCommentThread('resource', 'res-1', 'stud-2', 'Thanks!')

    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1', 'tutor-9'], {
      kind: 'resource',
      title: 'New comment in a thread you commented on',
      body: 'Thanks!',
      link: '/classroom/class-1',
    })
  })

  it('leaves out a past commenter who has since left the class', async () => {
    // Commenting proved access THEN. stud-8 has been unenrolled since, and the body carries an
    // excerpt of the thread, so they must not receive it.
    vi.mocked(selectForEntities).mockResolvedValue([{ author_id: 'stud-1' }, { author_id: 'stud-8' }] as never)
    vi.mocked(getClassMembers).mockResolvedValue(members('stud-1', 'stud-2'))

    await notifyCommentThread('resource', 'res-1', 'stud-2', 'still here?')

    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1'], expect.anything())
  })

  it('notifies nobody when every past commenter has left', async () => {
    vi.mocked(selectForEntities).mockResolvedValue([{ author_id: 'stud-8' }] as never)
    vi.mocked(getClassMembers).mockResolvedValue(members('stud-2'))

    await notifyCommentThread('resource', 'res-1', 'stud-2', 'anyone?')

    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('notifies nobody on the FIRST comment - no one is waiting on it yet', async () => {
    vi.mocked(selectForEntities).mockResolvedValue([{ author_id: 'stud-2' }] as never)

    await notifyCommentThread('resource', 'res-1', 'stud-2', 'First!')

    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('sends a global item to the feed, having no classroom page to link to', async () => {
    vi.mocked(selectResourceClassIdAsService).mockResolvedValue({ class_id: null } as never)
    vi.mocked(selectForEntities).mockResolvedValue([{ author_id: 'stud-1' }] as never)

    await notifyCommentThread('resource', 'res-1', 'tutor-9', 'note')

    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1'], expect.objectContaining({ link: '/notifications' }))
    // No class, so no membership to narrow by - the academy-wide rule that allowed the comment stands.
    expect(getClassMembers).not.toHaveBeenCalled()
  })

  it('truncates a long comment to the notification body length', async () => {
    vi.mocked(selectForEntities).mockResolvedValue([{ author_id: 'stud-1' }] as never)

    await notifyCommentThread('resource', 'res-1', 'tutor-9', 'x'.repeat(400))

    const body = vi.mocked(notifyBestEffort).mock.calls[0][1].body as string
    expect(body).toHaveLength(140)
  })
})

describe('notifyCommentThread never fails the comment', () => {
  it('swallows and logs a lookup failure - the comment is already written', async () => {
    vi.mocked(selectResourceClassIdAsService).mockRejectedValue(new Error('db down'))

    await expect(notifyCommentThread('resource', 'res-1', 'stud-1', 'hi')).resolves.toBeUndefined()

    expect(logError).toHaveBeenCalled()
  })
})
