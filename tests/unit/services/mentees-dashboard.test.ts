import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/assignments', () => ({
  selectActiveAssignmentsByClassIdsAsService: vi.fn(),
  selectAssignmentsByIdsAsService: vi.fn(),
}))
vi.mock('@/lib/data/attendance', () => ({ selectRowsForStudentsAsService: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveEnrollmentsForStudents: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({ selectClassesByIds: vi.fn() }))
vi.mock('@/lib/data/submissions', () => ({
  selectActiveSubmissionsForStudentsAsService: vi.fn(),
  selectEvaluatedSubmissionsForStudentsAsService: vi.fn(),
}))
vi.mock('@/lib/services/mentorships', () => ({ studentIdsOfMentor: vi.fn() }))
vi.mock('@/lib/services/student-relationship-subtitles', () => ({ buildStudentRelationshipSubtitles: vi.fn() }))
vi.mock('@/lib/services/users', () => ({
  displayName: vi.fn((profile: { full_name: string | null; email: string }) => profile.full_name ?? profile.email),
  getProfilesByIds: vi.fn(),
}))

import { selectActiveAssignmentsByClassIdsAsService, selectAssignmentsByIdsAsService } from '@/lib/data/assignments'
import { selectRowsForStudentsAsService } from '@/lib/data/attendance'
import { selectActiveEnrollmentsForStudents } from '@/lib/data/class-membership'
import { selectClassesByIds } from '@/lib/data/classes'
import {
  selectActiveSubmissionsForStudentsAsService,
  selectEvaluatedSubmissionsForStudentsAsService,
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
    vi.mocked(selectActiveEnrollmentsForStudents).mockResolvedValueOnce([]) // no enrollments -> empty signals
    vi.mocked(selectActiveSubmissionsForStudentsAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectEvaluatedSubmissionsForStudentsAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectRowsForStudentsAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectClassesByIds).mockResolvedValueOnce([] as any)
    vi.mocked(selectActiveAssignmentsByClassIdsAsService).mockResolvedValueOnce([] as any)
    vi.mocked(selectAssignmentsByIdsAsService).mockResolvedValueOnce([] as any)

    await expect(getMentorDashboard({ id: 'mentor-1', role: 'mentor' } as any)).resolves.toMatchObject({
      mentees: [{ id: 's-1', name: 'Sara', subtitle: 'Grade 10 - Algebra' }],
    })
  })

  it('reads each concern ONCE for the whole cohort and groups signals per mentee', async () => {
    const past = '2020-01-01T00:00:00.000Z'
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['s-1', 's-2'])
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([
        ['s-1', { id: 's-1', full_name: 'Sara', email: 'sara@test.dev', role: 'student', class_level: 'Grade 10' }],
        ['s-2', { id: 's-2', full_name: 'Sam', email: 'sam@test.dev', role: 'student', class_level: 'Grade 9' }],
      ]) as any,
    )
    vi.mocked(buildStudentRelationshipSubtitles).mockResolvedValueOnce(new Map())

    // Wave 1 - keyed by the whole set.
    vi.mocked(selectActiveEnrollmentsForStudents).mockResolvedValueOnce([
      { student_id: 's-1', class_id: 'c-1' },
      { student_id: 's-2', class_id: 'c-2' },
    ])
    vi.mocked(selectActiveSubmissionsForStudentsAsService).mockResolvedValueOnce([
      { student_id: 's-2', assignment_id: 'a-4', status: 'submitted', submitted_at: past, drive_link: null },
    ] as any)
    vi.mocked(selectEvaluatedSubmissionsForStudentsAsService).mockResolvedValueOnce([
      {
        student_id: 's-1',
        assignment_id: 'a-3',
        status: 'graded',
        submitted_at: past,
        drive_link: null,
        score: 8,
        graded_at: past,
      },
    ] as any)
    vi.mocked(selectRowsForStudentsAsService).mockResolvedValueOnce([
      { student_id: 's-1', class_id: 'c-1', session_date: '2026-01-03', status: 'present' },
      { student_id: 's-1', class_id: 'c-1', session_date: '2026-01-02', status: 'present' },
      { student_id: 's-1', class_id: 'c-1', session_date: '2026-01-01', status: 'absent' },
      { student_id: 's-2', class_id: 'c-2', session_date: '2026-01-01', status: 'present' },
    ] as any)

    // Wave 2 - derived from wave 1.
    vi.mocked(selectClassesByIds).mockResolvedValueOnce([
      { id: 'c-1', name: 'Math' },
      { id: 'c-2', name: 'Science' },
    ] as any)
    vi.mocked(selectActiveAssignmentsByClassIdsAsService).mockResolvedValueOnce([
      { id: 'a-1', class_id: 'c-1', title: 'A1', due_date: past }, // s-1 overdue (unsubmitted, past)
      { id: 'a-2', class_id: 'c-1', title: 'A2', due_date: soon }, // s-1 due soon (unsubmitted)
      { id: 'a-4', class_id: 'c-2', title: 'A4', due_date: past }, // s-2 submitted -> not overdue
    ] as any)
    vi.mocked(selectAssignmentsByIdsAsService).mockResolvedValueOnce([
      { id: 'a-3', title: 'A3', topic: null, class_id: 'c-1', max_marks: 10 },
    ] as any)

    const result = await getMentorDashboard({ id: 'mentor-1', role: 'mentor' } as any)

    // Grouping is faithful to the former per-mentee path.
    expect(result.menteeCount).toBe(2)
    expect(result.totalOverdue).toBe(1)
    expect(result.mentees).toMatchObject([
      { id: 's-1', attendanceRate: 67, avgGrade: 80, overdueCount: 1 }, // 2/3 present; 8/10 graded
      { id: 's-2', attendanceRate: 100, avgGrade: null, overdueCount: 0 },
    ])
    expect(result.avgAttendance).toBe(83.5) // mean(67, 100)
    expect(result.avgGrade).toBe(80)
    expect(result.recentResults).toHaveLength(1)
    expect(result.recentResults[0]).toMatchObject({ menteeId: 's-1' })

    // The whole point of the refactor: one read per concern, NOT one per mentee.
    for (const read of [
      selectActiveEnrollmentsForStudents,
      selectActiveSubmissionsForStudentsAsService,
      selectEvaluatedSubmissionsForStudentsAsService,
      selectRowsForStudentsAsService,
      selectClassesByIds,
      selectActiveAssignmentsByClassIdsAsService,
      selectAssignmentsByIdsAsService,
    ]) {
      expect(read).toHaveBeenCalledTimes(1)
    }
    expect(selectActiveEnrollmentsForStudents).toHaveBeenCalledWith(['s-1', 's-2'])
  })
})
