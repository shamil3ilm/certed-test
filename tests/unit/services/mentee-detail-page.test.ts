import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/mentees', () => ({
  canMentor: vi.fn(),
  getMenteeOverview: vi.fn(),
}))

import { loadMenteeDetailPageData } from '@/lib/services/page-data/mentee-detail-page'
import { canMentor, getMenteeOverview } from '@/lib/services/mentees'

beforeEach(() => vi.resetAllMocks())

describe('loadMenteeDetailPageData', () => {
  it('returns null when the actor is not allowed to mentor the student', async () => {
    vi.mocked(canMentor).mockResolvedValueOnce(false)

    await expect(loadMenteeDetailPageData({ id: 'tutor-1', role: 'tutor' } as any, 'student-1')).resolves.toBeNull()

    expect(getMenteeOverview).not.toHaveBeenCalled()
  })

  it('returns null when the overview is missing', async () => {
    vi.mocked(canMentor).mockResolvedValueOnce(true)
    vi.mocked(getMenteeOverview).mockResolvedValueOnce(null)

    await expect(loadMenteeDetailPageData({ id: 'tutor-1', role: 'tutor' } as any, 'student-1')).resolves.toBeNull()
  })

  it('returns the overview plus a display name', async () => {
    vi.mocked(canMentor).mockResolvedValueOnce(true)
    vi.mocked(getMenteeOverview).mockResolvedValueOnce({
      student: { id: 'student-1', email: 'student@example.com', full_name: 'Asha', class_level: 'Grade 8' },
      classes: [{ id: 'class-1', name: 'Math' }],
      submissions: [
        {
          assignmentId: 'a-1',
          assignmentTitle: 'Essay',
          classLabel: 'Math',
          status: 'late',
          submittedAt: '2026-07-15T10:00:00.000Z',
          driveLink: 'https://drive.test/file',
        },
      ],
      overdue: [
        { assignmentId: 'a-2', assignmentTitle: 'Worksheet', classLabel: 'Math', dueDate: '2026-07-10T00:00:00.000Z' },
      ],
    } as any)

    await expect(loadMenteeDetailPageData({ id: 'tutor-1', role: 'tutor' } as any, 'student-1')).resolves.toMatchObject(
      {
        name: 'Asha',
        overview: {
          student: { email: 'student@example.com' },
          classes: [{ name: 'Math' }],
        },
      },
    )
  })
})
