import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/attendance', () => ({
  countStatusesForStudent: vi.fn(),
  RECENT_CLASS_MARKS_CAP: 200,
  selectForClassDate: vi.fn(),
  selectHistoryPageForClass: vi.fn(),
  selectMarkedSessionIdsOn: vi.fn(),
  selectRecentForClass: vi.fn(),
  selectStudentPage: vi.fn(),
}))
vi.mock('@/lib/data/class-sessions', () => ({ selectSessionsByIds: vi.fn() }))

import { selectMarkedSessionIdsOn } from '@/lib/data/attendance'
import { selectSessionsByIds } from '@/lib/data/class-sessions'
import { markedSessionsOn } from '@/lib/services/attendance/queries'

beforeEach(() => vi.resetAllMocks())

describe('markedSessionsOn', () => {
  it('returns the marked sessions with the times they ran', async () => {
    vi.mocked(selectMarkedSessionIdsOn).mockResolvedValue(['s1', 's2'])
    vi.mocked(selectSessionsByIds).mockResolvedValue([
      { id: 's1', class_id: 'c1', actual_start: 'a', actual_end: 'b', summary: 'private' },
      { id: 's2', class_id: 'c1', actual_start: null, actual_end: null },
    ] as never)

    expect(await markedSessionsOn(['c1'], '2026-08-05')).toEqual([
      { id: 's1', class_id: 'c1', actual_start: 'a', actual_end: 'b' },
      { id: 's2', class_id: 'c1', actual_start: null, actual_end: null },
    ])
    expect(selectMarkedSessionIdsOn).toHaveBeenCalledWith(['c1'], '2026-08-05')
    expect(selectSessionsByIds).toHaveBeenCalledWith(['s1', 's2'])
  })

  it('is empty when nothing was marked', async () => {
    vi.mocked(selectMarkedSessionIdsOn).mockResolvedValue([])
    vi.mocked(selectSessionsByIds).mockResolvedValue([])
    expect(await markedSessionsOn(['c1'], '2026-08-05')).toEqual([])
  })
})
