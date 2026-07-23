import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ canMentor: vi.fn() }))
vi.mock('@/lib/capabilities', () => ({ isAdminTier: vi.fn() }))
vi.mock('@/lib/services/mentorships', () => ({ listMentorships: vi.fn(), studentIdsOfMentor: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/services/users', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/users')>('@/lib/services/users')
  return { ...actual, getProfileById: vi.fn(), getProfileNamesByIds: vi.fn() }
})

import { canMentor } from '@/lib/permission'
import { isAdminTier } from '@/lib/capabilities'
import { listMentorships, studentIdsOfMentor } from '@/lib/services/mentorships'
import { getProfileById } from '@/lib/services/users'
import { getProfileNamesByIds } from '@/lib/services/users'
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
    })
  })
})

describe('getMenteeListView', () => {
  it('builds the admin mentee list from all mentorship links', async () => {
    vi.mocked(isAdminTier).mockReturnValueOnce(true as any)
    vi.mocked(listMentorships).mockResolvedValueOnce([
      { student_id: 'stud-1' },
      { student_id: 'stud-2' },
      { student_id: 'stud-1' },
    ] as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(
      new Map([
        ['stud-1', 'Stu Dent'],
        ['stud-2', 'Sam Student'],
      ]) as any,
    )

    await expect(getMenteeListView(tutor)).resolves.toEqual({
      isAdmin: true,
      title: 'Mentees',
      description: 'Students currently linked through mentor assignments across the academy.',
      items: [
        { id: 'stud-1', name: 'Stu Dent' },
        { id: 'stud-2', name: 'Sam Student' },
      ],
    })
  })

  it('builds the mentor-specific mentee list from the caller student ids', async () => {
    vi.mocked(isAdminTier).mockReturnValueOnce(false as any)
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['stud-1'] as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(new Map([['stud-1', 'Stu Dent']]) as any)

    await expect(getMenteeListView(tutor)).resolves.toEqual({
      isAdmin: false,
      title: 'My mentees',
      description: 'Students you mentor, like a class tutor - you look after their overall progress across subjects.',
      items: [{ id: 'stud-1', name: 'Stu Dent' }],
    })
  })
})
