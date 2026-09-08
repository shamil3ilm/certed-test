import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/classes', () => ({
  listClasses: vi.fn(),
  listClassesByIds: vi.fn(),
  myClassScope: vi.fn(),
}))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForTutor: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ listActiveTeacherCandidates: vi.fn() }))

import type { Capability } from '@/lib/capabilities'
import { loadCalendarPageData } from '@/lib/services/page-data/calendar-page'
import { listClasses, listClassesByIds, myClassScope } from '@/lib/services/classes'
import { selectActiveClassIdsForTutor } from '@/lib/data/class-membership'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listActiveTeacherCandidates } from '@/lib/services/users'

// The loader now decides against the RESOLVED capability set passed in (persona
// baseline + admin overrides), so tests supply that set directly.
const caps = (...names: Capability[]) => new Set<Capability>(names)

beforeEach(() => {
  vi.resetAllMocks()
  // loadPersonaFlags always returns a full flags object in production; default it so
  // the loader's isClassAdmin read is safe when a test doesn't set specific flags.
  vi.mocked(loadPersonaFlags).mockResolvedValue({
    isClassAdmin: false,
    isTutor: false,
    hasMentorAuthority: false,
  } as any)
})

describe('loadCalendarPageData', () => {
  it('returns empty management data for a read-only actor (no manageCalendar)', async () => {
    vi.mocked(myClassScope).mockResolvedValueOnce([] as any)
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

  it('treats a sub_admin (manageClasses, no admin tier) as an academy-wide class manager', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({
      isClassAdmin: true,
      isTutor: false,
      hasMentorAuthority: false,
    } as any)
    vi.mocked(listClasses).mockResolvedValueOnce([{ id: 'c1', name: 'Math', status: 'active' }] as any)
    vi.mocked(listActiveTeacherCandidates).mockResolvedValueOnce([{ id: 't1', name: 'Maya Mentor' }] as any)

    // Academy-wide class authority is read from the RESOLVED capability set now
    // (manageClasses), not flags.isClassAdmin, so a deny override is honoured.
    await expect(
      loadCalendarPageData({ id: 'sub-1', role: 'sub_admin' } as any, caps('manageCalendar', 'manageClasses')),
    ).resolves.toEqual({
      canManage: true,
      isAdmin: true, // academy-wide: all classes + the academy-wide event option
      classes: [{ id: 'c1', name: 'Math' }],
      tutors: [{ id: 't1', name: 'Maya Mentor' }],
    })
  })

  it('loads only the tutor-owned active classes for a manager without the admin tier', async () => {
    // A tutor manager sees only classes they actively teach, not classes they
    // merely attend via another persona.
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isTutor: true, isClassAdmin: false } as any)
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

  /**
   * The academy-wide reader who is NOT caught by the isAdmin branch above: a sub_admin
   * whose manageClasses is denied by an override holds neither manageAdminTier nor
   * manageClasses, so it falls through to the scope branch - where myClassScope answers
   * null, because RLS lets a sub_admin read every class.
   *
   * Null must not be spent as an `.in()` list. Reading the classes whole is what the
   * isAdmin branch already does; doing it here too keeps one uuid per class out of the
   * query URL on a page whose only job is to fill a class picker.
   */
  it('an academy-wide reader outside the isAdmin branch reads the list whole, not by ids', async () => {
    vi.mocked(myClassScope).mockResolvedValueOnce(null)
    vi.mocked(listClasses).mockResolvedValueOnce([
      { id: 'c1', name: 'Math', status: 'active' },
      { id: 'c2', name: 'Science', status: 'archived' },
    ] as any)

    await expect(loadCalendarPageData({ id: 'sub-1', role: 'sub_admin' } as any, caps())).resolves.toMatchObject({
      classes: [{ id: 'c1', name: 'Math' }],
    })
    expect(listClassesByIds, 'null must never become a uuid list').not.toHaveBeenCalled()
  })

  it('an EMPTY scope still means "no classes", and is not confused with academy-wide', async () => {
    // [] and null are the two ends of the same parameter and must not collapse: [] is a
    // reader with no classes, null is a reader with all of them. Reading the whole list
    // for [] would show a student every class on the calendar.
    vi.mocked(myClassScope).mockResolvedValueOnce([])
    await expect(loadCalendarPageData({ id: 'student-2', role: 'student' } as any, caps())).resolves.toMatchObject({
      classes: [],
    })
    expect(listClasses).not.toHaveBeenCalled()
    expect(listClassesByIds).not.toHaveBeenCalled()
  })
})
