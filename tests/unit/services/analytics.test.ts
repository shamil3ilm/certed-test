import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/classes', () => ({ myClassIds: vi.fn() }))
vi.mock('@/lib/services/attendance', () => ({ summarizeAttendanceForStudent: vi.fn() }))
vi.mock('@/lib/data/analytics', () => ({
  countActiveResources: vi.fn(),
  countActiveAnnouncements: vi.fn(),
  sumResourceDownloads: vi.fn(),
  countResourcesByUploader: vi.fn(),
  countAuditByActorAction: vi.fn(),
  selectSessionsForClasses: vi.fn(),
  selectAttendanceStatusesForClasses: vi.fn(),
  selectTimedAttendanceForStudent: vi.fn(),
}))

import { myClassIds } from '@/lib/services/classes'
import { summarizeAttendanceForStudent } from '@/lib/services/attendance'
import {
  countActiveResources,
  countActiveAnnouncements,
  sumResourceDownloads,
  countResourcesByUploader,
  countAuditByActorAction,
  selectSessionsForClasses,
  selectAttendanceStatusesForClasses,
  selectTimedAttendanceForStudent,
} from '@/lib/data/analytics'
import { getAdminAnalytics, getStudentAnalytics, getTutorAnalytics } from '@/lib/services/analytics'

const me = { id: 'user-1' } as any

beforeEach(() => vi.resetAllMocks())

describe('getAdminAnalytics', () => {
  it('surfaces the academy content + activity totals', async () => {
    vi.mocked(countActiveResources).mockResolvedValueOnce(12)
    vi.mocked(countActiveAnnouncements).mockResolvedValueOnce(4)
    vi.mocked(sumResourceDownloads).mockResolvedValueOnce(99)
    await expect(getAdminAnalytics()).resolves.toEqual({ resources: 12, announcements: 4, downloads: 99 })
  })
})

describe('getTutorAnalytics', () => {
  it('sums tutor working time into hours, counts sessions + uploads, and rates attendance', async () => {
    vi.mocked(myClassIds).mockResolvedValueOnce(['c1'])
    vi.mocked(selectSessionsForClasses).mockResolvedValueOnce([
      { tutor_join_at: '2026-07-01T10:00:00Z', tutor_leave_at: '2026-07-01T11:00:00Z' },
      { tutor_join_at: '2026-07-02T10:00:00Z', tutor_leave_at: '2026-07-02T11:00:00Z' },
    ] as any)
    vi.mocked(selectAttendanceStatusesForClasses).mockResolvedValueOnce([
      { status: 'present' },
      { status: 'present' },
      { status: 'late' },
      { status: 'absent' },
    ])
    vi.mocked(countResourcesByUploader).mockResolvedValueOnce(5)

    await expect(getTutorAnalytics(me)).resolves.toEqual({
      teachingHours: '2.0h', // 60 + 60 minutes
      sessionsHeld: 2,
      resourcesUploaded: 5,
      attendanceRate: 75, // (present 2 + late 1) / 4
    })
    expect(countResourcesByUploader).toHaveBeenCalledWith('user-1')
  })

  it('reports a dash for teaching hours when no session times are recorded', async () => {
    vi.mocked(myClassIds).mockResolvedValueOnce([])
    vi.mocked(selectSessionsForClasses).mockResolvedValueOnce([])
    vi.mocked(selectAttendanceStatusesForClasses).mockResolvedValueOnce([])
    vi.mocked(countResourcesByUploader).mockResolvedValueOnce(0)

    await expect(getTutorAnalytics(me)).resolves.toEqual({
      teachingHours: '-',
      sessionsHeld: 0,
      resourcesUploaded: 0,
      attendanceRate: 0,
    })
  })
})

describe('getStudentAnalytics', () => {
  it('sums learning time, counts attended (present+late) sessions, and passes downloads through', async () => {
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
    vi.mocked(countAuditByActorAction).mockResolvedValueOnce(7)

    await expect(getStudentAnalytics(me)).resolves.toEqual({
      learningHours: '2.0h', // 90 + 30 minutes
      sessionsAttended: 4, // present 3 + late 1
      attendanceRate: 80,
      downloads: 7,
    })
    expect(countAuditByActorAction).toHaveBeenCalledWith('user-1', 'resource.download')
  })
})
