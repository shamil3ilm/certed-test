import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/capabilities', () => ({ isAdminTier: vi.fn() }))
vi.mock('@/lib/services/class-tutors', () => ({
  activeTeachingProfileIds: vi.fn(),
  activeMentorProfileIds: vi.fn(),
}))
vi.mock('@/lib/services/mentorships', () => ({ listMentorshipsForUsersHub: vi.fn() }))
vi.mock('@/lib/services/authorization', () => ({ actorHasCapability: vi.fn() }))
vi.mock('@/lib/services/users', () => ({
  countUsersHubStats: vi.fn(),
  displayName: vi.fn((p: { full_name: string | null; email: string }) => p.full_name ?? p.email),
  getProfilesByIds: vi.fn(),
  listActiveMentorCandidates: vi.fn(),
  listProfilesByRole: vi.fn(),
}))

import { isAdminTier } from '@/lib/capabilities'
import { actorHasCapability } from '@/lib/services/authorization'
import { activeMentorProfileIds, activeTeachingProfileIds } from '@/lib/services/class-tutors'
import { loadAdminUsersPageData, ROLE_FILTERS, ROLE_TABS, usersUrl } from '@/lib/services/page-data/admin-users'
import { listMentorshipsForUsersHub } from '@/lib/services/mentorships'
import {
  countUsersHubStats,
  getProfilesByIds,
  listActiveMentorCandidates,
  listProfilesByRole,
} from '@/lib/services/users'

beforeEach(() => {
  vi.resetAllMocks()
  // The page data asks whether this viewer may assign mentors (it decides whether the student
  // role is offered). Default to yes, so a test that primes its own reads still gets the
  // ordinary answer; the withholding case sets it to no explicitly.
  vi.mocked(actorHasCapability).mockResolvedValue(true as any)
})

function primeMocks(isSuper = true, canAssignMentor = true) {
  vi.mocked(isAdminTier).mockReturnValue(isSuper as any)
  vi.mocked(actorHasCapability).mockResolvedValue(canAssignMentor as any)
  vi.mocked(countUsersHubStats).mockResolvedValue({ students: 0, tutors: 0, adminTier: 0 } as any)
  vi.mocked(listActiveMentorCandidates).mockResolvedValue([] as any)
  vi.mocked(listMentorshipsForUsersHub).mockResolvedValue([] as any)
  vi.mocked(listProfilesByRole).mockResolvedValue({ items: [], total: 0 } as any)
  vi.mocked(getProfilesByIds).mockResolvedValue(new Map() as any)
  vi.mocked(activeTeachingProfileIds).mockResolvedValue([] as any)
  vi.mocked(activeMentorProfileIds).mockResolvedValue([] as any)
}

describe('usersUrl', () => {
  it('builds a People URL with the role filter and preserves the other filters', () => {
    expect(
      usersUrl({
        tab: 'people',
        role: 'staff',
        page: 2,
        q: 'sara',
        status: 'active',
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    ).toBe('/admin/users?tab=people&role=staff&page=2&q=sara&status=active&sortBy=name&sortOrder=asc')
  })

  it('omits the role when it is the default (all)', () => {
    expect(usersUrl({ tab: 'people', role: 'all' })).toBe('/admin/users?tab=people')
    expect(usersUrl({ tab: 'people' })).toBe('/admin/users?tab=people')
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
    const onlyPage = {
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
    }
    // Asked for page 2 of a single-page result: the loader re-reads the last real page.
    vi.mocked(listProfilesByRole).mockResolvedValue(onlyPage as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([['t1', { id: 't1', full_name: 'Maya Mentor', email: 'maya@test.com', role: 'tutor' }]]) as any,
    )
    vi.mocked(activeTeachingProfileIds).mockResolvedValueOnce([] as any)
    vi.mocked(activeMentorProfileIds).mockResolvedValueOnce([] as any)

    const result = await loadAdminUsersPageData({ id: 'admin-1', role: 'admin' } as any, {
      tab: 'students',
      page: '2',
      q: ' sara ',
      status: 'active',
      sortBy: 'name',
      sortOrder: 'asc',
    })

    // page 2 does not exist for a 1-row result, so the view reports the page it actually
    // shows - otherwise the pager reads "Page 2" above an empty list.
    expect(result.filters).toEqual({
      tab: 'people',
      role: 'student',
      page: 1,
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
    // ...and re-read at the clamped page, so the rows shown are that page's rows.
    expect(listProfilesByRole).toHaveBeenLastCalledWith('student', {
      page: 1,
      pageSize: 20,
      search: 'sara',
      status: 'active',
      sortBy: 'name',
      sortOrder: 'asc',
    })
    expect(result.tabProfiles).toHaveLength(1)
    expect(result.roleOptions).toEqual(['student', 'tutor', 'mentor', 'sub_admin', 'admin'])
    expect(result.mentorNames.get('t1')).toBe('Maya Mentor')
    expect(result.mentorsByStudent.get('s1')).toEqual([{ id: 'm1', mentor_id: 't1', student_id: 's1' }])
  })

  it('defaults invalid filters and offers sub-admins every non-admin role (student/tutor/mentor)', async () => {
    vi.mocked(isAdminTier).mockReturnValueOnce(false as any)
    vi.mocked(countUsersHubStats).mockResolvedValueOnce({ students: 0, tutors: 0, adminTier: 0 } as any)
    vi.mocked(listActiveMentorCandidates).mockResolvedValueOnce([] as any)
    vi.mocked(listMentorshipsForUsersHub).mockResolvedValueOnce([] as any)
    vi.mocked(listProfilesByRole).mockResolvedValueOnce({ items: [], total: 0 } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(new Map() as any)
    vi.mocked(activeTeachingProfileIds).mockResolvedValueOnce([] as any)
    vi.mocked(activeMentorProfileIds).mockResolvedValueOnce([] as any)

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
      tab: 'people',
      role: 'all',
      page: 1,
      q: undefined,
      status: undefined,
      sortBy: undefined,
      sortOrder: undefined,
    })
    expect(result.roleOptions).toEqual(['student', 'tutor', 'mentor'])
    expect(result.canAssignMentor).toBe(true)
  })

  /**
   * A student is created WITH a mentor, and assigning one needs manageMentorships (admin and
   * sub_admin hold it by default; an override can take it away). Offering the role to someone
   * who cannot finish it would fail on submit, so it is withheld - and the form says why.
   */
  it('withholds the student role from a user manager who cannot assign mentors', async () => {
    primeMocks(false, false)

    const result = await loadAdminUsersPageData({ id: 'sub-1', role: 'sub_admin' } as any, {})

    expect(actorHasCapability).toHaveBeenCalledWith('sub-1', 'manageMentorships')
    expect(result.canAssignMentor).toBe(false)
    expect(result.roleOptions).toEqual(['tutor', 'mentor'])
  })

  it('maps the role filter to the roles it loads (staff spans tutor + mentor; admin spans admin + sub_admin; all spans everyone)', async () => {
    primeMocks()
    await loadAdminUsersPageData({ id: 'a', role: 'admin' } as any, { tab: 'people', role: 'staff' })
    expect(listProfilesByRole).toHaveBeenLastCalledWith(['tutor', 'mentor'], expect.objectContaining({ page: 1 }))

    vi.mocked(listProfilesByRole).mockClear()
    primeMocks()
    await loadAdminUsersPageData({ id: 'a', role: 'admin' } as any, { tab: 'people', role: 'admin' })
    expect(listProfilesByRole).toHaveBeenLastCalledWith(['admin', 'sub_admin'], expect.objectContaining({ page: 1 }))

    vi.mocked(listProfilesByRole).mockClear()
    await loadAdminUsersPageData({ id: 'a', role: 'admin' } as any, { tab: 'people' })
    expect(listProfilesByRole).toHaveBeenLastCalledWith(
      ['student', 'tutor', 'mentor', 'admin', 'sub_admin'],
      expect.objectContaining({ page: 1 }),
    )
  })

  it('clamps a sub-admin to tutor/mentor/student rows whatever role filter is requested', async () => {
    // A sub_admin (non-super) must never load the ADMIN tier, even by hand-editing
    // ?role=admin - the read side mirrors the tier rule the writes use
    // (SUB_ADMIN_MANAGEABLE: tutor/mentor/student).
    primeMocks(false)
    await loadAdminUsersPageData({ id: 'sub', role: 'sub_admin' } as any, { tab: 'people', role: 'admin' })
    expect(listProfilesByRole).toHaveBeenLastCalledWith([], expect.objectContaining({ page: 1 }))

    vi.mocked(listProfilesByRole).mockClear()
    primeMocks(false)
    await loadAdminUsersPageData({ id: 'sub', role: 'sub_admin' } as any, { tab: 'people', role: 'staff' })
    expect(listProfilesByRole).toHaveBeenLastCalledWith(['tutor', 'mentor'], expect.objectContaining({ page: 1 }))

    vi.mocked(listProfilesByRole).mockClear()
    primeMocks(false)
    await loadAdminUsersPageData({ id: 'sub', role: 'sub_admin' } as any, { tab: 'people', role: 'mentor' })
    expect(listProfilesByRole).toHaveBeenLastCalledWith(['mentor'], expect.objectContaining({ page: 1 }))

    vi.mocked(listProfilesByRole).mockClear()
    primeMocks(false)
    await loadAdminUsersPageData({ id: 'sub', role: 'sub_admin' } as any, { tab: 'people' })
    expect(listProfilesByRole).toHaveBeenLastCalledWith(
      ['student', 'tutor', 'mentor'],
      expect.objectContaining({ page: 1 }),
    )
  })

  it('always loads students on the Mentor-assignments tab, ignoring the role filter', async () => {
    primeMocks()
    const result = await loadAdminUsersPageData({ id: 'a', role: 'admin' } as any, { tab: 'mentors', role: 'admin' })
    expect(result.filters.tab).toBe('mentors')
    expect(listProfilesByRole).toHaveBeenLastCalledWith('student', expect.objectContaining({ page: 1 }))
  })

  it('maps a legacy ?tab=tutors bookmark onto the People list filtered to academic staff', async () => {
    primeMocks()
    const result = await loadAdminUsersPageData({ id: 'a', role: 'admin' } as any, { tab: 'tutors' } as any)
    expect(result.filters).toMatchObject({ tab: 'people', role: 'staff' })
    expect(listProfilesByRole).toHaveBeenLastCalledWith(['tutor', 'mentor'], expect.objectContaining({ page: 1 }))
  })
})

describe('ROLE_TABS', () => {
  // The strip replaced the Role dropdown, so these two properties are what keep it honest:
  // every tab must be a filter the page understands, and the tabs must not overlap.
  it('offers one tab per account role, and every key is a real filter', () => {
    expect(ROLE_TABS.map((r) => r.key)).toEqual(['all', 'student', 'tutor', 'mentor', 'admin'])
    const known = new Set(ROLE_FILTERS.map((r) => r.key))
    for (const tab of ROLE_TABS) expect(known.has(tab.key)).toBe(true)
  })

  it('leaves out "staff", which spans two roles, while keeping it a working URL', () => {
    // A mentor who also tutors matches both 'tutor' and 'mentor', so a "Tutors & mentors" tab
    // would show some people twice over. The stat tile still links to it.
    expect(ROLE_TABS.map((r) => r.key)).not.toContain('staff')
    expect(ROLE_FILTERS.map((r) => r.key)).toContain('staff')
    expect(usersUrl({ tab: 'people', role: 'staff' })).toBe('/admin/users?tab=people&role=staff')
  })

  it('labels each tab the same as the filter it stands for', () => {
    const labels = new Map(ROLE_FILTERS.map((r) => [r.key, r.label]))
    for (const tab of ROLE_TABS) expect(tab.label).toBe(labels.get(tab.key))
  })
})
