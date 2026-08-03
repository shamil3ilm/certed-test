import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unit-test the shaping in listMyClasses (counts + resolved member names) by
// mocking the data layer directly, so it is independent of query-builder wiring.
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/permission/class', () => ({ mentorAuthorityClassIds: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn(), getProfilesByIds: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({
  countActiveClasses: vi.fn(),
  selectAllClassIds: vi.fn(),
  selectAllClasses: vi.fn(),
  selectClassById: vi.fn(),
  selectClassesByIds: vi.fn(),
}))
vi.mock('@/lib/data/class-membership', () => ({
  selectActiveClassIdsForStudent: vi.fn(),
  selectActiveClassIdsForTutor: vi.fn(),
  selectActiveEnrollmentRefsByClassIds: vi.fn(),
  selectActiveEnrollmentRowsForClass: vi.fn(),
  selectActiveTutorRefsByClassIds: vi.fn(),
  selectActiveTutorRowsForClass: vi.fn(),
}))
vi.mock('@/lib/data/mentorships', () => ({ selectActiveMentorshipsForStudents: vi.fn() }))

import { loadPersonaFlags } from '@/lib/permission/personas'
import { getProfileNamesByIds } from '@/lib/services/users'
import { selectAllClassIds, selectClassesByIds } from '@/lib/data/classes'
import { selectActiveEnrollmentRefsByClassIds, selectActiveTutorRefsByClassIds } from '@/lib/data/class-membership'
import { listMyClasses } from '@/lib/services/classes/queries'

beforeEach(() => vi.resetAllMocks())

describe('listMyClasses member shaping', () => {
  it('names the single member of a 1-on-1 class and keeps counts for a group class', async () => {
    // Unique id per test avoids React cache() bleed across the suite.
    const me = { id: 'admin-shaping-1' } as any
    vi.mocked(loadPersonaFlags).mockResolvedValue({
      isAdmin: true,
      isTutor: false,
      isStudent: false,
      hasMentorAuthority: false,
    } as any)
    vi.mocked(selectAllClassIds).mockResolvedValue(['c1', 'c2'])
    vi.mocked(selectClassesByIds).mockResolvedValue([
      { id: 'c1', name: 'Maths (1-on-1)', status: 'active' },
      { id: 'c2', name: 'Group Physics', status: 'active' },
    ] as any)
    vi.mocked(selectActiveTutorRefsByClassIds).mockResolvedValue([
      { class_id: 'c1', tutor_id: 't1' },
      { class_id: 'c2', tutor_id: 't1' },
    ])
    vi.mocked(selectActiveEnrollmentRefsByClassIds).mockResolvedValue([
      { class_id: 'c1', student_id: 's1' },
      { class_id: 'c2', student_id: 's2' },
      { class_id: 'c2', student_id: 's3' },
    ])
    vi.mocked(getProfileNamesByIds).mockResolvedValue(
      new Map([
        ['t1', 'Mr Rahman'],
        ['s1', 'Aisha Khan'],
        ['s2', 'Bob'],
        ['s3', 'Cara'],
      ]),
    )

    const result = await listMyClasses(me)
    const c1 = result.find((c) => c.id === 'c1')!
    const c2 = result.find((c) => c.id === 'c2')!

    expect(c1.studentCount).toBe(1)
    expect(c1.students).toEqual([{ id: 's1', name: 'Aisha Khan' }])
    expect(c1.tutors).toEqual([{ id: 't1', name: 'Mr Rahman' }])

    expect(c2.studentCount).toBe(2)
    expect(c2.students.map((s) => s.name)).toEqual(['Bob', 'Cara'])
  })

  it('falls back to "Unknown" when a name cannot be resolved', async () => {
    const me = { id: 'admin-shaping-2' } as any
    vi.mocked(loadPersonaFlags).mockResolvedValue({
      isAdmin: true,
      isTutor: false,
      isStudent: false,
      hasMentorAuthority: false,
    } as any)
    vi.mocked(selectAllClassIds).mockResolvedValue(['c1'])
    vi.mocked(selectClassesByIds).mockResolvedValue([{ id: 'c1', name: 'Maths', status: 'active' }] as any)
    vi.mocked(selectActiveTutorRefsByClassIds).mockResolvedValue([])
    vi.mocked(selectActiveEnrollmentRefsByClassIds).mockResolvedValue([{ class_id: 'c1', student_id: 's-gone' }])
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map())

    const [c1] = await listMyClasses(me)
    expect(c1.students).toEqual([{ id: 's-gone', name: 'Unknown' }])
  })
})
