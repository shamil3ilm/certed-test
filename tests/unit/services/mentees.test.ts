import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ canMentor: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/mentorships', () => ({ listMentorships: vi.fn(), studentIdsOfMentor: vi.fn() }))
vi.mock('@/lib/services/student-relationship-subtitles', () => ({ buildStudentRelationshipSubtitles: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/services/users', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/users')>('@/lib/services/users')
  return {
    ...actual,
    getProfileById: vi.fn(),
    getProfilesByIds: vi.fn(),
    displayName: vi.fn((profile: { full_name: string | null; email: string }) => profile.full_name ?? profile.email),
  }
})

import { canMentor } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listMentorships, studentIdsOfMentor } from '@/lib/services/mentorships'
import { buildStudentRelationshipSubtitles } from '@/lib/services/student-relationship-subtitles'
import { getProfileById } from '@/lib/services/users'
import { getProfilesByIds } from '@/lib/services/users'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMenteeListView, getMenteeOverview } from '@/lib/services/mentees'

const tutor = { id: 'teach-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const student = { id: 'stud-1', email: 's@x.c', full_name: 'Stu Dent', role: 'student', status: 'active' }

beforeEach(() => vi.resetAllMocks())

describe('getMenteeOverview', () => {
  it('returns null (not an error) for a non-mentor, without any further DB reads', async () => {
    vi.mocked(canMentor).mockResolvedValueOnce(false)
    const result = await getMenteeOverview(tutor, 'stud-1')
    expect(result).toBeNull()
    expect(getProfileById).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('returns null if the student profile cannot be resolved', async () => {
    vi.mocked(canMentor).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(null)
    const result = await getMenteeOverview(tutor, 'stud-1')
    expect(result).toBeNull()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('builds an overview for a verified mentor + resolvable student, with no enrollments', async () => {
    vi.mocked(canMentor).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(student as any)
    // enrollments read → empty, so classes/assignments queries are skipped (classIds.length === 0)
    // One client per data-layer call. With no enrollments the classes and
    // assignments reads short-circuit on the empty id list without opening one,
    // so only the enrolment lookup and the submissions read remain.
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: [], error: null }) as any) // selectActiveClassIdsForStudent
      .mockReturnValueOnce(makeClient({ data: [], error: null }) as any) // selectActiveSubmissionsForStudentAsService
    const result = await getMenteeOverview(tutor, 'stud-1')
    expect(result).toEqual({
      student,
      classes: [],
      submissions: [],
      overdue: [],
      evaluations: {
        filters: { period: '90d', classId: undefined, sort: 'recent' },
        grading: {
          overallAverage: null,
          periodAverage: null,
          previousAverage: null,
          delta: null,
          gradedCount: 0,
          rows: [],
        },
        attendance: {
          overallRate: null,
          periodRate: null,
          previousRate: null,
          delta: null,
          totalSessions: 0,
          rows: [],
        },
      },
    })
  })
})

describe('getMenteeListView', () => {
  it('builds the oversight roster (all mentorship links) for a viewer without mentor authority', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ hasMentorAuthority: false } as any)
    vi.mocked(listMentorships).mockResolvedValueOnce([
      { student_id: 'stud-1' },
      { student_id: 'stud-2' },
      { student_id: 'stud-1' },
    ] as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([
        [
          'stud-1',
          { id: 'stud-1', full_name: 'Stu Dent', email: 'stud-1@test.dev', role: 'student', class_level: 'Grade 8' },
        ],
        [
          'stud-2',
          {
            id: 'stud-2',
            full_name: 'Sam Student',
            email: 'stud-2@test.dev',
            role: 'student',
            class_level: 'Grade 7',
          },
        ],
      ]) as any,
    )
    vi.mocked(buildStudentRelationshipSubtitles).mockResolvedValueOnce(
      new Map([
        ['stud-1', 'Grade 8 - Maths'],
        ['stud-2', 'Grade 7 - Science'],
      ]),
    )

    await expect(getMenteeListView(tutor)).resolves.toEqual({
      isOversight: true,
      title: 'Mentoring',
      description: 'Students currently linked through mentor assignments across the academy.',
      items: [
        { id: 'stud-1', name: 'Stu Dent', subtitle: 'Grade 8 - Maths' },
        { id: 'stud-2', name: 'Sam Student', subtitle: 'Grade 7 - Science' },
      ],
    })
  })

  it('builds the personal mentee list from the caller student ids for an actual mentor', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ hasMentorAuthority: true } as any)
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['stud-1'] as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([
        [
          'stud-1',
          { id: 'stud-1', full_name: 'Stu Dent', email: 'stud-1@test.dev', role: 'student', class_level: 'Grade 8' },
        ],
      ]) as any,
    )
    vi.mocked(buildStudentRelationshipSubtitles).mockResolvedValueOnce(new Map([['stud-1', 'Grade 8 - Maths']]))

    await expect(getMenteeListView(tutor)).resolves.toEqual({
      isOversight: false,
      title: 'Mentees',
      description: 'Students you mentor, like a class tutor - you look after their overall progress across subjects.',
      items: [{ id: 'stud-1', name: 'Stu Dent', subtitle: 'Grade 8 - Maths' }],
    })
  })
})
