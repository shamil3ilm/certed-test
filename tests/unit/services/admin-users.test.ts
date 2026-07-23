import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/capabilities', () => ({ isAdminTier: vi.fn() }))
vi.mock('@/lib/services/mentorships', () => ({ listMentorshipsForUsersHub: vi.fn() }))
vi.mock('@/lib/services/users', () => ({
  countUsersHubStats: vi.fn(),
  displayName: vi.fn((p: { full_name: string | null; email: string }) => p.full_name ?? p.email),
  getProfilesByIds: vi.fn(),
  listActiveMentorCandidates: vi.fn(),
  listProfilesByRole: vi.fn(),
}))

import { isAdminTier } from '@/lib/capabilities'
import { loadAdminUsersPageData, usersUrl } from '@/lib/services/page-data/admin-users'
import { listMentorshipsForUsersHub } from '@/lib/services/mentorships'
import {
  countUsersHubStats,
  getProfilesByIds,
  listActiveMentorCandidates,
  listProfilesByRole,
} from '@/lib/services/users'

beforeEach(() => vi.resetAllMocks())

describe('usersUrl', () => {
  it('builds a users hub URL preserving tab filters', () => {
    expect(usersUrl({ tab: 'students', page: 2, q: 'sara', status: 'active', sortBy: 'name', sortOrder: 'asc' })).toBe(
      '/admin/users?tab=students&page=2&q=sara&status=active&sortBy=name&sortOrder=asc',
    )
  })
})

describe('loadAdminUsersPageData', () => {
  it('parses filters, loads current tab rows, and groups mentor links', async () => {
    vi.mocked(isAdminTier).mockReturnValueOnce(true as any)
    vi.mocked(countUsersHubStats).mockResolvedValueOnce({ students: 10, tutors: 3, adminTier: 2 } as any)
    vi.mocked(listActiveMentorCandidates).mockResolvedValueOnce([{ id: 't1', name: 'Maya Mentor' }] as any)
    vi.mocked(listMentorshipsForUsersHub).mockResolvedValueOnce([
      { id: 'm1', mentor_id: 't1', student_id: 's1' },
      { id: 'm2', mentor_id: 't1', student_id: 's2' },
    ] as any)
    vi.mocked(listProfilesByRole).mockResolvedValueOnce({
      items: [
        {
          id: 's1',
          email: 's1@test.com',
          full_name: 'Sara Student',
          role: 'student',
          status: 'active',
          class_level: 'Grade 10',
        },
      ],
      total: 1,
    } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([['t1', { id: 't1', full_name: 'Maya Mentor', email: 'maya@test.com', role: 'tutor' }]]) as any,
    )

    const result = await loadAdminUsersPageData({ id: 'admin-1', role: 'admin' } as any, {
      tab: 'students',
      page: '2',
      q: ' sara ',
      status: 'active',
      sortBy: 'name',
      sortOrder: 'asc',
    })

    expect(result.filters).toEqual({
      tab: 'students',
      page: 2,
      q: 'sara',
      status: 'active',
      sortBy: 'name',
      sortOrder: 'asc',
    })
    expect(listProfilesByRole).toHaveBeenCalledWith('student', {
      page: 2,
      pageSize: 20,
      search: 'sara',
      status: 'active',
      sortBy: 'name',
      sortOrder: 'asc',
    })
    expect(result.roleOptions).toEqual(['student', 'tutor', 'mentor', 'sub_admin', 'admin'])
    expect(result.assignedStudents).toBe(2)
    expect(result.mentorNames.get('t1')).toBe('Maya Mentor')
    expect(result.mentorsByStudent.get('s1')).toEqual([{ id: 'm1', mentor_id: 't1', student_id: 's1' }])
  })

  it('defaults invalid filters and uses restricted role options for sub-admins', async () => {
    vi.mocked(isAdminTier).mockReturnValueOnce(false as any)
    vi.mocked(countUsersHubStats).mockResolvedValueOnce({ students: 0, tutors: 0, adminTier: 0 } as any)
    vi.mocked(listActiveMentorCandidates).mockResolvedValueOnce([] as any)
    vi.mocked(listMentorshipsForUsersHub).mockResolvedValueOnce([] as any)
    vi.mocked(listProfilesByRole).mockResolvedValueOnce({ items: [], total: 0 } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(new Map() as any)

    const result = await loadAdminUsersPageData(
      { id: 'sub-1', role: 'sub_admin' } as any,
      {
        tab: 'bogus',
        page: '0',
        q: '   ',
        status: 'bad',
        sortBy: 'wrong',
        sortOrder: 'bad',
      } as any,
    )

    expect(result.filters).toEqual({
      tab: 'students',
      page: 1,
      q: undefined,
      status: undefined,
      sortBy: undefined,
      sortOrder: undefined,
    })
    expect(result.roleOptions).toEqual(['student', 'tutor'])
  })
})
