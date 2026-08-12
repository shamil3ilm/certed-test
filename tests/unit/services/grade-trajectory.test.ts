import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/submissions-service-reads', () => ({
  selectEvaluatedSubmissionsForStudentAsService: vi.fn(),
}))
vi.mock('@/lib/data/assignments', () => ({ selectAssignmentsByIdsAsService: vi.fn() }))

import { selectEvaluatedSubmissionsForStudentAsService } from '@/lib/data/submissions-service-reads'
import { selectAssignmentsByIdsAsService } from '@/lib/data/assignments'
import { getStudentGradeTrajectory } from '@/lib/services/page-data/grade-trajectory'

const sub = (assignment_id: string, score: number, graded_at: string) => ({
  assignment_id,
  score,
  graded_at,
  status: 'graded',
  submitted_at: graded_at,
  drive_link: null,
})
const assignment = (id: string, max_marks: number | null) => ({ id, title: id, topic: null, class_id: 'c1', max_marks })

beforeEach(() => vi.resetAllMocks())

describe('getStudentGradeTrajectory', () => {
  it('returns an empty trajectory when the student has no graded work', async () => {
    vi.mocked(selectEvaluatedSubmissionsForStudentAsService).mockResolvedValue([])
    await expect(getStudentGradeTrajectory('s1')).resolves.toEqual({
      average: null,
      gradedCount: 0,
      points: [],
      direction: null,
      delta: null,
    })
  })

  it('weights the average by points and orders the trend oldest -> newest', async () => {
    // Given out of order; must sort by graded_at. a1 60%, a2 90%.
    vi.mocked(selectEvaluatedSubmissionsForStudentAsService).mockResolvedValue([
      sub('a2', 9, '2026-02-10T09:00:00Z'),
      sub('a1', 6, '2026-01-10T09:00:00Z'),
    ] as any)
    vi.mocked(selectAssignmentsByIdsAsService).mockResolvedValue([assignment('a1', 10), assignment('a2', 10)] as any)

    const t = await getStudentGradeTrajectory('s1')
    // (6 + 9) / (10 + 10) * 100 = 75
    expect(t.average).toBe(75)
    expect(t.gradedCount).toBe(2)
    expect(t.points).toEqual([
      { label: '10 Jan', value: 60 },
      { label: '10 Feb', value: 90 },
    ])
    // recent (90) vs earlier (60) -> improving
    expect(t.direction).toBe('up')
    expect(t.delta).toBe(30)
  })

  it('flags a declining trend and ignores small noise as flat', async () => {
    vi.mocked(selectAssignmentsByIdsAsService).mockResolvedValue([assignment('a1', 100)] as any)

    vi.mocked(selectEvaluatedSubmissionsForStudentAsService).mockResolvedValue([
      sub('a1', 90, '2026-01-01T00:00:00Z'),
      sub('a1', 60, '2026-02-01T00:00:00Z'),
    ] as any)
    expect((await getStudentGradeTrajectory('s1')).direction).toBe('down')

    vi.mocked(selectEvaluatedSubmissionsForStudentAsService).mockResolvedValue([
      sub('a1', 80, '2026-01-01T00:00:00Z'),
      sub('a1', 81, '2026-02-01T00:00:00Z'),
    ] as any)
    expect((await getStudentGradeTrajectory('s1')).direction).toBe('flat')
  })

  it('excludes submissions whose assignment has no positive maximum', async () => {
    vi.mocked(selectEvaluatedSubmissionsForStudentAsService).mockResolvedValue([
      sub('a1', 8, '2026-01-10T09:00:00Z'),
      sub('a2', 5, '2026-02-10T09:00:00Z'), // no max -> not a percentage
    ] as any)
    vi.mocked(selectAssignmentsByIdsAsService).mockResolvedValue([assignment('a1', 10), assignment('a2', null)] as any)

    const t = await getStudentGradeTrajectory('s1')
    expect(t.gradedCount).toBe(1)
    expect(t.points).toEqual([{ label: '10 Jan', value: 80 }])
    expect(t.direction).toBeNull() // only one usable point
  })
})
