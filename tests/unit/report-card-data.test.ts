import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForStudent: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({ selectClassNamesByIdsAsService: vi.fn() }))
vi.mock('@/lib/data/assignments', () => ({ selectAssignmentsByIdsAsService: vi.fn() }))
vi.mock('@/lib/data/submissions', () => ({ selectScoresForStudentAsService: vi.fn() }))
vi.mock('@/lib/data/attendance', () => ({ selectStatusesForStudentAsService: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/mentees', () => ({ canMentor: vi.fn() }))
vi.mock('@/lib/services/attendance', () => ({
  summarizeAttendance: vi.fn(() => ({ present: 0, late: 0, absent: 0, total: 0, rate: 0 })),
}))

import { loadPersonaFlags } from '@/lib/permission/personas'
import { getProfileById } from '@/lib/services/users'
import { canMentor } from '@/lib/services/mentees'
import { getReportCardData } from '@/lib/report-card/data'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { selectClassNamesByIdsAsService } from '@/lib/data/classes'
import { selectAssignmentsByIdsAsService } from '@/lib/data/assignments'
import { selectStatusesForStudentAsService } from '@/lib/data/attendance'
import { selectScoresForStudentAsService } from '@/lib/data/submissions'

beforeEach(() => vi.resetAllMocks())

describe('getReportCardData', () => {
  it('rejects a self-target that is not a student profile', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: false } as any)
    vi.mocked(getProfileById).mockResolvedValueOnce({
      id: 'tutor-1',
      role: 'tutor',
      status: 'active',
      email: 'tutor@test.com',
    } as any)

    await expect(
      getReportCardData(
        {
          profile: { id: 'tutor-1', role: 'tutor', status: 'active' } as any,
          accessState: 'active',
          capabilities: { allowed: new Set(['viewClasses']), denied: new Set(), sourceByCapability: new Map() },
        } as any,
        'tutor-1',
      ),
    ).resolves.toBeNull()

    expect(selectScoresForStudentAsService).not.toHaveBeenCalled()
  })

  it('still allows an actively mentored student target', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: false } as any)
    vi.mocked(canMentor).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce({
      id: 'student-1',
      role: 'student',
      status: 'active',
      email: 'student@test.com',
    } as any)
    vi.mocked(selectScoresForStudentAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectStatusesForStudentAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce([] as any)
    vi.mocked(selectAssignmentsByIdsAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectClassNamesByIdsAsService).mockResolvedValueOnce([] as any)

    await expect(
      getReportCardData(
        {
          profile: { id: 'mentor-1', role: 'mentor', status: 'active' } as any,
          accessState: 'active',
          capabilities: { allowed: new Set(['viewMentees']), denied: new Set(), sourceByCapability: new Map() },
        } as any,
        'student-1',
      ),
    ).resolves.toMatchObject({
      student: { id: 'student-1', role: 'student' },
      marks: [],
    })
  })
})
