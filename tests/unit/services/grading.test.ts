import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/assignments', () => ({ listAssignments: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ getClass: vi.fn(), myClassIds: vi.fn() }))
vi.mock('@/lib/services/submissions', () => ({ listUngradedSubmissions: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))

import { listAssignments } from '@/lib/services/assignments'
import { getClass, myClassIds } from '@/lib/services/classes'
import { loadGradingQueuePageData } from '@/lib/services/page-data/grading'
import { listUngradedSubmissions } from '@/lib/services/submissions'
import { getProfileNamesByIds } from '@/lib/services/users'

beforeEach(() => vi.resetAllMocks())

describe('loadGradingQueuePageData', () => {
  it('loads, filters, groups, and sorts the grading queue', async () => {
    vi.mocked(myClassIds).mockResolvedValueOnce(['class-1', 'class-2'] as any)
    vi.mocked(listAssignments).mockResolvedValueOnce([
      { id: 'a1', class_id: 'class-1', title: 'Algebra' },
      { id: 'a2', class_id: 'class-2', title: 'Biology' },
    ] as any)
    vi.mocked(listUngradedSubmissions).mockResolvedValueOnce([
      { id: 's1', assignment_id: 'a1', student_id: 'u1', submitted_at: '2026-07-15T10:00:00.000Z', status: 'late' },
      {
        id: 's2',
        assignment_id: 'a1',
        student_id: 'u2',
        submitted_at: '2026-07-14T10:00:00.000Z',
        status: 'submitted',
      },
      {
        id: 's3',
        assignment_id: 'a2',
        student_id: 'u3',
        submitted_at: '2026-07-13T10:00:00.000Z',
        status: 'submitted',
      },
    ] as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(
      new Map([
        ['u1', 'Sara Student'],
        ['u2', 'Sam Student'],
        ['u3', 'Ben Biology'],
      ]) as any,
    )
    vi.mocked(getClass)
      .mockResolvedValueOnce({ id: 'class-1', name: 'Math' } as any)
      .mockResolvedValueOnce({ id: 'class-2', name: 'Science' } as any)

    const result = await loadGradingQueuePageData({ id: 'tutor-1' } as any, { q: ' stu ', classId: 'class-1' })

    expect(result.totalUngraded).toBe(3)
    expect(result.filteredCount).toBe(2)
    expect(result.classFilter).toBe('class-1')
    expect(result.query).toBe('stu')
    expect(result.classOptions).toEqual([
      { id: 'class-1', name: 'Math' },
      { id: 'class-2', name: 'Science' },
    ])
    expect(result.sections).toEqual([
      {
        classId: 'class-1',
        className: 'Math',
        items: [
          {
            id: 's2',
            assignmentId: 'a1',
            assignmentTitle: 'Algebra',
            studentId: 'u2',
            studentName: 'Sam Student',
            submittedAt: '2026-07-14T10:00:00.000Z',
            status: 'submitted',
          },
          {
            id: 's1',
            assignmentId: 'a1',
            assignmentTitle: 'Algebra',
            studentId: 'u1',
            studentName: 'Sara Student',
            submittedAt: '2026-07-15T10:00:00.000Z',
            status: 'late',
          },
        ],
      },
    ])
  })

  it('returns an empty queue cleanly when the user has no classes', async () => {
    vi.mocked(myClassIds).mockResolvedValueOnce([] as any)
    vi.mocked(listAssignments).mockResolvedValueOnce([] as any)
    vi.mocked(listUngradedSubmissions).mockResolvedValueOnce([] as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(new Map() as any)

    await expect(loadGradingQueuePageData({ id: 'tutor-1' } as any, {})).resolves.toEqual({
      totalUngraded: 0,
      query: undefined,
      classFilter: undefined,
      classOptions: [],
      sections: [],
      filteredCount: 0,
    })
  })
})
