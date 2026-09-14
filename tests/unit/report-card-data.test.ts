import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForStudent: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({ selectClassNamesByIdsAsService: vi.fn() }))
// Pass-through: the labelling rule has its own tests; here the stored name stands in for it.
vi.mock('@/lib/services/classes/class-labels', () => ({
  resolveClassLabels: async (rows: Array<{ id: string; name: string }>) => new Map(rows.map((r) => [r.id, r.name])),
}))
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

  // The capability gate is the first line of defence: a student holds viewClasses
  // for their OWN card, so a foreign id is refused on the capability alone, before
  // any profile or mark is read.
  it('refuses a foreign student to a viewer without viewMentees', async () => {
    await expect(
      getReportCardData(
        {
          profile: { id: 'student-2', role: 'student', status: 'active' } as any,
          accessState: 'active',
          capabilities: { allowed: new Set(['viewClasses']), denied: new Set(), sourceByCapability: new Map() },
        } as any,
        'student-1',
      ),
    ).resolves.toBeNull()

    expect(loadPersonaFlags).not.toHaveBeenCalled()
    expect(getProfileById).not.toHaveBeenCalled()
  })

  // viewMentees says the viewer may see SOME mentees, not this one. The mentorship
  // edge is what authorizes the specific target.
  it('refuses a foreign student the viewer does not actually mentor', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: false } as any)
    vi.mocked(canMentor).mockResolvedValueOnce(false)

    await expect(
      getReportCardData(
        {
          profile: { id: 'mentor-1', role: 'mentor', status: 'active' } as any,
          accessState: 'active',
          capabilities: { allowed: new Set(['viewMentees']), denied: new Set(), sourceByCapability: new Map() },
        } as any,
        'student-1',
      ),
    ).resolves.toBeNull()

    // The refusal has to come from the mentorship check itself, not an earlier bail.
    expect(canMentor).toHaveBeenCalledWith(expect.objectContaining({ id: 'mentor-1' }), 'student-1')
    expect(getProfileById).not.toHaveBeenCalled()
  })

  // A revoked account still carries its capability set until the session is rebuilt,
  // so access state - not capability - is what closes the door.
  it('refuses a disabled viewer asking for their own card', async () => {
    await expect(
      getReportCardData(
        {
          profile: { id: 'student-1', role: 'student', status: 'active' } as any,
          accessState: 'disabled',
          capabilities: { allowed: new Set(['viewClasses']), denied: new Set(), sourceByCapability: new Map() },
        } as any,
        'student-1',
      ),
    ).resolves.toBeNull()

    expect(getProfileById).not.toHaveBeenCalled()
  })

  it('reports the average to one decimal (no rounding 99.6% up to 100%) and counts non-percentage items', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: true } as any)
    vi.mocked(getProfileById).mockResolvedValueOnce({
      id: 'student-1',
      role: 'student',
      status: 'active',
      email: 'student@test.com',
    } as any)
    // 249/250 = 99.6% (must NOT round to 100). The zero-max item can't yield a
    // percentage, so it's excluded from the average but counted in excludedNoPercent.
    vi.mocked(selectScoresForStudentAsService).mockResolvedValueOnce([
      { assignment_id: 'a1', score: 249 },
      { assignment_id: 'a2', score: 0 },
    ] as any)
    vi.mocked(selectStatusesForStudentAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce([] as any)
    vi.mocked(selectAssignmentsByIdsAsService).mockResolvedValueOnce([
      { id: 'a1', class_id: 'c1', title: 'Final exam', topic: null, max_marks: 250 },
      { id: 'a2', class_id: 'c1', title: 'Participation', topic: null, max_marks: 0 },
    ] as any)
    vi.mocked(selectClassNamesByIdsAsService).mockResolvedValueOnce([{ id: 'c1', name: 'Math' }] as any)

    const data = await getReportCardData(
      {
        profile: { id: 'admin-1', role: 'admin', status: 'active' } as any,
        accessState: 'active',
        capabilities: { allowed: new Set(['viewMentees']), denied: new Set(), sourceByCapability: new Map() },
      } as any,
      'student-1',
    )

    expect(data?.average).toEqual({ percent: 99.6, gradedCount: 1, excludedNoPercent: 1 })
  })
})
