import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/classes', () => ({ listClasses: vi.fn(), listClassesByIds: vi.fn(), myClassIds: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForTutor: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ listActiveTeacherCandidates: vi.fn() }))

import type { Capability } from '@/lib/capabilities'
import { loadCalendarPageData } from '@/lib/services/page-data/calendar-page'
import { listClasses, listClassesByIds, myClassIds } from '@/lib/services/classes'
import { selectActiveClassIdsForTutor } from '@/lib/data/class-membership'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listActiveTeacherCandidates } from '@/lib/services/users'

// The loader now decides against the RESOLVED capability set passed in (persona
// baseline + admin overrides), so tests supply that set directly.
const caps = (...names: Capability[]) => new Set<Capability>(names)

beforeEach(() => vi.resetAllMocks())

describe('loadCalendarPageData', () => {
  it('returns empty management data for a read-only actor (no manageCalendar)', async () => {
    vi.mocked(myClassIds).mockResolvedValueOnce([] as any)
    await expect(loadCalendarPageData({ id: 'student-1', role: 'student' } as any, caps())).resolves.toEqual({
      canManage: false,
      isAdmin: false,
      classes: [],
      tutors: [],
    })
  })

  it('loads active classes and active tutors for an admin manager', async () => {
    vi.mocked(listClasses).mockResolvedValueOnce([
      { id: 'c1', name: 'Math', status: 'active' },
      { id: 'c2', name: 'Science', status: 'archived' },
    ] as any)
    vi.mocked(listActiveTeacherCandidates).mockResolvedValueOnce([{ id: 't1', name: 'Maya Mentor' }] as any)

    await expect(
      loadCalendarPageData({ id: 'admin-1', role: 'admin' } as any, caps('manageCalendar', 'manageAdminTier')),
    ).resolves.toEqual({
      canManage: true,
      isAdmin: true,
      classes: [{ id: 'c1', name: 'Math' }],
      tutors: [{ id: 't1', name: 'Maya Mentor' }],
    })
  })

  it('loads only the tutor-owned active classes for a manager without the admin tier', async () => {
    // A tutor manager sees only classes they actively teach, not classes they
    // merely attend via another persona.
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isTutor: true } as any)
    vi.mocked(selectActiveClassIdsForTutor).mockResolvedValueOnce(['c1', 'c3'] as any)
    vi.mocked(listClassesByIds).mockResolvedValueOnce([
      { id: 'c1', name: 'Math', status: 'active' },
      { id: 'c3', name: 'History', status: 'archived' },
    ] as any)

    await expect(
      loadCalendarPageData(
        { id: 'tutor-1', role: 'tutor', full_name: 'Tarun Tutor', email: 'tarun@test.com' } as any,
        caps('manageCalendar'),
      ),
    ).resolves.toEqual({
      canManage: true,
      isAdmin: false,
      classes: [{ id: 'c1', name: 'Math' }],
      tutors: [{ id: 'tutor-1', name: 'Tarun Tutor' }],
    })
  })
})
