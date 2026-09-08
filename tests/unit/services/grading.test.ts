import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/assignments', () => ({ listAssignments: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ listClassesByIds: vi.fn(), myClassIds: vi.fn() }))
vi.mock('@/lib/services/submissions', () => ({ listUngradedSubmissions: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))

import { listAssignments } from '@/lib/services/assignments'
import { listClassesByIds, myClassIds } from '@/lib/services/classes'
import { loadGradingQueuePageData } from '@/lib/services/page-data/grading'
import { listUngradedSubmissions } from '@/lib/services/submissions'
import { getProfileNamesByIds } from '@/lib/services/users'

beforeEach(() => vi.resetAllMocks())

describe('loadGradingQueuePageData', () => {
  it('reads the caller whole scope when no class is named', async () => {
    vi.mocked(myClassIds).mockResolvedValue(['class-1', 'class-2'] as any)
    vi.mocked(listAssignments).mockResolvedValueOnce([] as any)
    vi.mocked(listUngradedSubmissions).mockResolvedValueOnce([] as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(new Map() as any)
    vi.mocked(listClassesByIds).mockResolvedValueOnce([] as any)
    await loadGradingQueuePageData({ id: 'tutor-1' } as any, {})
    expect(listAssignments).toHaveBeenCalledWith({ classIds: ['class-1', 'class-2'], activeOnly: true })
  })

  it('a class the caller cannot reach yields nothing, not their whole scope', async () => {
    // Widening back to everything would turn a bad id into a broader read than the caller
    // asked for - the opposite of what a filter should do.
    vi.mocked(myClassIds).mockResolvedValue(['class-1'] as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(new Map() as any)
    vi.mocked(listClassesByIds).mockResolvedValueOnce([] as any)
    const result = await loadGradingQueuePageData({ id: 'tutor-1' } as any, { classId: 'someone-elses' })
    expect(listAssignments).not.toHaveBeenCalled()
    expect(result.sections).toEqual([])
    expect(result.filteredCount).toBe(0)
  })

  it('loads, filters, groups, and sorts the grading queue', async () => {
    vi.mocked(myClassIds).mockResolvedValue(['class-1', 'class-2'] as any)
    // Scoped to class-1 by the query, so class-2's assignment never comes back.
    vi.mocked(listAssignments).mockResolvedValueOnce([{ id: 'a1', class_id: 'class-1', title: 'Algebra' }] as any)
    vi.mocked(listUngradedSubmissions).mockResolvedValueOnce([
      { id: 's1', assignment_id: 'a1', student_id: 'u1', submitted_at: '2026-07-15T10:00:00.000Z', status: 'late' },
      {
        id: 's2',
        assignment_id: 'a1',
        student_id: 'u2',
        submitted_at: '2026-07-14T10:00:00.000Z',
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
    vi.mocked(listClassesByIds).mockResolvedValueOnce([{ id: 'class-1', name: 'Math' }] as any)

    const result = await loadGradingQueuePageData({ id: 'tutor-1' } as any, { q: ' stu ', classId: 'class-1' })

    // The class narrowing reached the QUERY: one class's assignments were asked for, not
    // the caller's whole scope. That is the difference between reading one class and
    // reading the academy to render one class.
    expect(listAssignments).toHaveBeenCalledWith({ classIds: ['class-1'], activeOnly: true })
    expect(result.filteredCount).toBe(2)
    expect(result.classFilter).toBe('class-1')
    expect(result.query).toBe('stu')
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
    vi.mocked(listClassesByIds).mockResolvedValueOnce([] as any)

    await expect(loadGradingQueuePageData({ id: 'tutor-1' } as any, {})).resolves.toEqual({
      query: undefined,
      classFilter: undefined,
      sections: [],
      filteredCount: 0,
    })
  })
})
