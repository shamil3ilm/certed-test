import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission', () => ({ canAccessClass: vi.fn() }))
vi.mock('@/lib/services/assignments', () => ({ getAssignment: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ getClass: vi.fn() }))
vi.mock('@/lib/services/comments', () => ({ listCommentsForEntities: vi.fn() }))
vi.mock('@/lib/services/submissions', () => ({
  listSubmissionsForAssignment: vi.fn(),
  listSupersededSubmissions: vi.fn(),
}))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))

import { canAccessClass } from '@/lib/permission'
import { getAssignment } from '@/lib/services/assignments'
import { loadAssignmentDetailPageData } from '@/lib/services/page-data/assignment-detail-page'
import { getClass } from '@/lib/services/classes'
import { listCommentsForEntities } from '@/lib/services/comments'
import { listSubmissionsForAssignment, listSupersededSubmissions } from '@/lib/services/submissions'
import { getProfileNamesByIds } from '@/lib/services/users'

beforeEach(() => vi.resetAllMocks())

describe('loadAssignmentDetailPageData', () => {
  it('returns null when the assignment is missing', async () => {
    vi.mocked(getAssignment).mockResolvedValueOnce(null)

    await expect(loadAssignmentDetailPageData({ id: 'tutor-1', role: 'tutor' } as any, 'a-1')).resolves.toBeNull()

    expect(canAccessClass).not.toHaveBeenCalled()
  })

  it('returns null when the actor cannot access the assignment class', async () => {
    vi.mocked(getAssignment).mockResolvedValueOnce({ id: 'a-1', class_id: 'class-1' } as any)
    vi.mocked(canAccessClass).mockResolvedValueOnce(false)
    vi.mocked(getClass).mockResolvedValueOnce({ id: 'class-1', name: 'Math' } as any)
    vi.mocked(listSubmissionsForAssignment).mockResolvedValueOnce([] as any)
    vi.mocked(listSupersededSubmissions).mockResolvedValueOnce([] as any)

    await expect(loadAssignmentDetailPageData({ id: 'tutor-1', role: 'tutor' } as any, 'a-1')).resolves.toBeNull()

    expect(getProfileNamesByIds).not.toHaveBeenCalled()
    expect(listCommentsForEntities).not.toHaveBeenCalled()
  })

  it('loads course, submissions, names, and grouped comments for an accessible assignment', async () => {
    vi.mocked(getAssignment).mockResolvedValueOnce({ id: 'a-1', class_id: 'class-1', title: 'Essay' } as any)
    vi.mocked(canAccessClass).mockResolvedValueOnce(true)
    vi.mocked(getClass).mockResolvedValueOnce({ id: 'class-1', name: 'Math' } as any)
    vi.mocked(listSubmissionsForAssignment).mockResolvedValueOnce([
      { id: 'sub-1', student_id: 'student-1' },
      { id: 'sub-2', student_id: 'student-2' },
    ] as any)
    vi.mocked(listSupersededSubmissions).mockResolvedValueOnce([
      { id: 'old-1a', student_id: 'student-1', submitted_at: '2026-01-02' },
      { id: 'old-1b', student_id: 'student-1', submitted_at: '2026-01-01' },
    ] as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(
      new Map([
        ['student-1', 'Asha'],
        ['student-2', 'Bilal'],
      ]),
    )
    vi.mocked(listCommentsForEntities).mockResolvedValueOnce(
      new Map([
        ['sub-1', [{ id: 'c-1' }]],
        ['sub-2', [{ id: 'c-2' }]],
      ]) as any,
    )

    const result = await loadAssignmentDetailPageData({ id: 'tutor-1', role: 'tutor' } as any, 'a-1')

    expect(result).toMatchObject({
      assignment: { id: 'a-1', class_id: 'class-1', title: 'Essay' },
      course: { id: 'class-1', name: 'Math' },
      submissions: [
        { id: 'sub-1', student_id: 'student-1' },
        { id: 'sub-2', student_id: 'student-2' },
      ],
    })
    expect(result?.names.get('student-1')).toBe('Asha')
    expect(result?.commentsBySub.get('sub-2')).toEqual([{ id: 'c-2' }])
    // Superseded submissions are grouped by student for the version-history UI.
    expect(result?.historyByStudent.get('student-1')?.map((s) => s.id)).toEqual(['old-1a', 'old-1b'])
    expect(result?.historyByStudent.has('student-2')).toBe(false)
  })
})
