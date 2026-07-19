import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/capabilities', () => ({ hasCapability: vi.fn(), isAdminTier: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ listClasses: vi.fn() }))
vi.mock('@/lib/services/class-tutors', () => ({ listClassTutors: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ listActiveByRole: vi.fn() }))

import { hasCapability, isAdminTier } from '@/lib/capabilities'
import { loadCalendarPageData } from '@/lib/services/page-data/calendar-page'
import { listClasses } from '@/lib/services/classes'
import { listClassTutors } from '@/lib/services/class-tutors'
import { listActiveByRole } from '@/lib/services/users'

beforeEach(() => vi.resetAllMocks())

describe('loadCalendarPageData', () => {
  it('returns empty management data for a read-only actor', async () => {
    vi.mocked(hasCapability).mockReturnValueOnce(false as any)
    vi.mocked(isAdminTier).mockReturnValueOnce(false as any)

    await expect(loadCalendarPageData({ id: 'student-1', role: 'student' } as any)).resolves.toEqual({
      canManage: false,
      isAdmin: false,
      classes: [],
      tutors: [],
    })
  })

  it('loads active classes and active tutors for an admin manager', async () => {
    vi.mocked(hasCapability).mockReturnValueOnce(true as any)
    vi.mocked(isAdminTier).mockReturnValueOnce(true as any)
    vi.mocked(listClasses).mockResolvedValueOnce([
      { id: 'c1', name: 'Math', status: 'active' },
      { id: 'c2', name: 'Science', status: 'archived' },
    ] as any)
    // listActiveByRole already filters to active tutors SQL-side and returns {id,name}.
    vi.mocked(listActiveByRole).mockResolvedValueOnce([{ id: 't1', name: 'Maya Mentor' }] as any)

    await expect(loadCalendarPageData({ id: 'admin-1', role: 'admin' } as any)).resolves.toEqual({
      canManage: true,
      isAdmin: true,
      classes: [{ id: 'c1', name: 'Math' }],
      tutors: [{ id: 't1', name: 'Maya Mentor' }],
    })
  })

  it('loads only the tutor-owned active classes for a tutor manager', async () => {
    vi.mocked(hasCapability).mockReturnValueOnce(true as any)
    vi.mocked(isAdminTier).mockReturnValueOnce(false as any)
    vi.mocked(listClasses).mockResolvedValueOnce([
      { id: 'c1', name: 'Math', status: 'active' },
      { id: 'c2', name: 'Science', status: 'active' },
      { id: 'c3', name: 'History', status: 'archived' },
    ] as any)
    vi.mocked(listClassTutors).mockResolvedValueOnce([
      { tutor_id: 'tutor-1', class_id: 'c1' },
      { tutor_id: 'other', class_id: 'c2' },
    ] as any)

    await expect(
      loadCalendarPageData({ id: 'tutor-1', role: 'tutor', full_name: 'Tarun Tutor', email: 'tarun@test.com' } as any),
    ).resolves.toEqual({
      canManage: true,
      isAdmin: false,
      classes: [{ id: 'c1', name: 'Math' }],
      tutors: [{ id: 'tutor-1', name: 'Tarun Tutor' }],
    })
  })
})
