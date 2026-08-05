import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/assignments', () => ({
  selectActiveAssignmentsByClassIdsAsService: vi.fn(),
  selectAssignmentsByIdsAsService: vi.fn(),
}))
vi.mock('@/lib/data/attendance', () => ({ selectRowsForStudentAsService: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForStudent: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({ selectClassesByIds: vi.fn() }))
vi.mock('@/lib/data/submissions', () => ({
  selectActiveSubmissionsForStudentAsService: vi.fn(),
  selectEvaluatedSubmissionsForStudentAsService: vi.fn(),
}))
vi.mock('@/lib/services/mentorships', () => ({ studentIdsOfMentor: vi.fn() }))
vi.mock('@/lib/services/student-relationship-subtitles', () => ({ buildStudentRelationshipSubtitles: vi.fn() }))
vi.mock('@/lib/services/users', () => ({
  displayName: vi.fn((profile: { full_name: string | null; email: string }) => profile.full_name ?? profile.email),
  getProfilesByIds: vi.fn(),
}))

import { selectActiveAssignmentsByClassIdsAsService, selectAssignmentsByIdsAsService } from '@/lib/data/assignments'
import { selectRowsForStudentAsService } from '@/lib/data/attendance'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { selectClassesByIds } from '@/lib/data/classes'
import {
  selectActiveSubmissionsForStudentAsService,
  selectEvaluatedSubmissionsForStudentAsService,
} from '@/lib/data/submissions'
import { studentIdsOfMentor } from '@/lib/services/mentorships'
import { buildStudentRelationshipSubtitles } from '@/lib/services/student-relationship-subtitles'
import { getProfilesByIds } from '@/lib/services/users'
import { getMentorDashboard } from '@/lib/services/mentees-dashboard'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getMentorDashboard', () => {
  it('uses the shared relationship subtitles for mentee cards', async () => {
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['s-1'])
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([
        ['s-1', { id: 's-1', full_name: 'Sara', email: 'sara@test.dev', role: 'student', class_level: 'Grade 10' }],
      ]) as any,
    )
    vi.mocked(buildStudentRelationshipSubtitles).mockResolvedValueOnce(new Map([['s-1', 'Grade 10 - Algebra']]))
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce([])
    vi.mocked(selectClassesByIds).mockResolvedValueOnce([] as any)
    vi.mocked(selectActiveAssignmentsByClassIdsAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectActiveSubmissionsForStudentAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectEvaluatedSubmissionsForStudentAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectRowsForStudentAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectAssignmentsByIdsAsService).mockResolvedValueOnce([] as any)

    await expect(getMentorDashboard({ id: 'mentor-1', role: 'mentor' } as any)).resolves.toMatchObject({
      mentees: [
        {
          id: 's-1',
          name: 'Sara',
          subtitle: 'Grade 10 - Algebra',
        },
      ],
    })
  })
})
