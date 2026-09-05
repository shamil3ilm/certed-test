import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/classes', () => ({ myClassIds: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ requireAdminPersona: vi.fn() }))
vi.mock('@/lib/services/attendance', () => ({ summarizeAttendanceForStudent: vi.fn() }))
vi.mock('@/lib/services/assignments', () => ({ listAssignments: vi.fn() }))
vi.mock('@/lib/services/submissions', () => ({
  listActiveSubmissions: vi.fn(),
  listMyActiveSubmissions: vi.fn(),
}))
vi.mock('@/lib/data/analytics', () => ({
  countActiveAnnouncements: vi.fn(),
  sumResourceDownloads: vi.fn(),
  selectSessionsForClasses: vi.fn(),
  selectAttendanceStatusesForClasses: vi.fn(),
  selectTimedAttendanceForStudent: vi.fn(),
}))

import { myClassIds } from '@/lib/services/classes'
import { requireAdminPersona } from '@/lib/permission/personas'
import { summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { listAssignments } from '@/lib/services/assignments'
import { listActiveSubmissions, listMyActiveSubmissions } from '@/lib/services/submissions'
import {
  countActiveAnnouncements,
  sumResourceDownloads,
  selectSessionsForClasses,
  selectAttendanceStatusesForClasses,
  selectTimedAttendanceForStudent,
} from '@/lib/data/analytics'
import { getAdminAnalytics, getStudentAnalytics, getTutorAnalytics } from '@/lib/services/analytics'

const me = { id: 'user-1' } as any

beforeEach(() => vi.resetAllMocks())

describe('getAdminAnalytics', () => {
  it('surfaces the academy announcement total and document-download count', async () => {
    vi.mocked(countActiveAnnouncements).mockResolvedValueOnce(4)
    vi.mocked(sumResourceDownloads).mockResolvedValueOnce(37)
    await expect(getAdminAnalytics(me)).resolves.toEqual({ announcements: 4, documentDownloads: 37 })
    expect(requireAdminPersona).toHaveBeenCalledWith(me)
  })

  it('refuses a non-admin before reading anything academy-wide', async () => {
    vi.mocked(requireAdminPersona).mockRejectedValueOnce(new Error('Admin only.'))
    await expect(getAdminAnalytics(me)).rejects.toThrow('Admin only.')
    expect(countActiveAnnouncements).not.toHaveBeenCalled()
    expect(sumResourceDownloads).not.toHaveBeenCalled()
  })
})

describe('getTutorAnalytics', () => {
  it('sums working time, counts marked work, rates attendance, and returns class ids', async () => {
    vi.mocked(myClassIds).mockResolvedValueOnce(['c1'])
    // Teaching hours come from the actual session window (start -> end).
    vi.mocked(selectSessionsForClasses).mockResolvedValueOnce([
      { actual_start: '2026-07-01T10:00:00Z', actual_end: '2026-07-01T11:00:00Z' },
      { actual_start: '2026-07-02T10:00:00Z', actual_end: '2026-07-02T11:00:00Z' },
    ] as any)
    vi.mocked(selectAttendanceStatusesForClasses).mockResolvedValueOnce([
      { status: 'present' },
      { status: 'present' },
      { status: 'late' },
      { status: 'absent' },
    ])
    vi.mocked(listAssignments).mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }] as any)
    // 3 marked (score + graded_at) + 1 still pending -> graded counts only the marked.
    vi.mocked(listActiveSubmissions).mockResolvedValueOnce([
      { id: 's1', score: 8, graded_at: '2026-07-03T10:00:00Z' },
      { id: 's2', score: 5, graded_at: '2026-07-03T10:00:00Z' },
      { id: 's3', score: 9, graded_at: '2026-07-03T10:00:00Z' },
      { id: 's4', score: null, graded_at: null },
    ] as any)

    await expect(getTutorAnalytics(me)).resolves.toEqual({
      teachingHours: '2.0h', // 60 + 60 minutes
      sessionsHeld: 2,
      attendanceRate: 75, // (present 2 + late 1) / 4
      graded: 3,
      classIds: ['c1'],
    })
  })

  it('reports a dash for teaching hours and skips the assignment scan when there are no classes', async () => {
    vi.mocked(myClassIds).mockResolvedValueOnce([])
    vi.mocked(selectSessionsForClasses).mockResolvedValueOnce([])
    vi.mocked(selectAttendanceStatusesForClasses).mockResolvedValueOnce([])

    await expect(getTutorAnalytics(me)).resolves.toEqual({
      teachingHours: '-',
      sessionsHeld: 0,
      attendanceRate: 0,
      graded: 0,
      classIds: [],
    })
    expect(listAssignments).not.toHaveBeenCalled()
  })
})

describe('getStudentAnalytics', () => {
  it('sums learning time, counts attended sessions + graded work, and returns class ids', async () => {
    vi.mocked(myClassIds).mockResolvedValueOnce(['c1'])
    vi.mocked(selectTimedAttendanceForStudent).mockResolvedValueOnce([
      { join_at: '2026-07-01T10:00:00Z', leave_at: '2026-07-01T11:30:00Z' }, // 90m
      { join_at: '2026-07-02T10:00:00Z', leave_at: '2026-07-02T10:30:00Z' }, // 30m
    ])
    vi.mocked(summarizeAttendanceForStudent).mockResolvedValueOnce({
      present: 3,
      late: 1,
      absent: 1,
      total: 5,
      rate: 80,
    })
    vi.mocked(listMyActiveSubmissions).mockResolvedValueOnce([
      { assignment_id: 'a1', score: 18, graded_at: '2026-08-01T00:00:00Z' },
      { assignment_id: 'a2', score: null, graded_at: null },
      { assignment_id: 'a3', score: 16, graded_at: '2026-08-03T00:00:00Z' },
    ] as any)

    await expect(getStudentAnalytics(me)).resolves.toEqual({
      learningHours: '2.0h', // 90 + 30 minutes
      sessionsAttended: 4, // present 3 + late 1
      attendanceRate: 80,
      gradedWork: 2,
      classIds: ['c1'],
    })
  })
})
