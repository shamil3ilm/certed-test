import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/permission', () => ({ canMentor: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { canMentor } from '@/lib/permission'
import { getProfileById } from '@/lib/services/users'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMenteeOverview } from '@/lib/services/mentees'

const teacher = { id: 'teach-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
const student = { id: 'stud-1', email: 's@x.c', full_name: 'Stu Dent', role: 'student', status: 'active' }

beforeEach(() => vi.resetAllMocks())

describe('getMenteeOverview', () => {
  it('returns null (not an error) for a non-mentor, without any further DB reads', async () => {
    vi.mocked(canMentor).mockResolvedValueOnce(false)
    const result = await getMenteeOverview(teacher, 'stud-1')
    expect(result).toBeNull()
    expect(getProfileById).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('returns null if the student profile cannot be resolved', async () => {
    vi.mocked(canMentor).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(null)
    const result = await getMenteeOverview(teacher, 'stud-1')
    expect(result).toBeNull()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('builds an overview for a verified mentor + resolvable student, with no enrollments', async () => {
    vi.mocked(canMentor).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(student as any)
    // enrollments read → empty, so classes/assignments queries are skipped (classIds.length === 0)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [], error: null }) as any)
    const result = await getMenteeOverview(teacher, 'stud-1')
    expect(result).toEqual({
      student,
      classes: [],
      submissions: [],
      overdue: [],
    })
  })
})
