import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({
  selectActiveClassIds: vi.fn(),
  selectActiveClassIdsAmong: vi.fn(async (ids: string[]) => ids),
}))
vi.mock('@/lib/data/class-membership', () => ({
  selectActiveClassIdsForStudents: vi.fn(async () => ['MENTEE-CLASS']),
}))
vi.mock('@/lib/data/personas', () => ({ selectScopedMenteeIds: vi.fn(async () => ['S1']) }))

import { loadPersonaFlags } from '@/lib/permission/personas'
import { selectActiveClassIds } from '@/lib/data/classes'
import { mentoringScopeClassIds } from '@/lib/permission/class'

/**
 * One definition of "oversight" for every mentoring surface.
 *
 * This existed as two: /students asked `!hasMentorAuthority` and showed a sub_admin every
 * mentored student, while /session-timings asked `isAdmin` and showed it nothing. The same
 * persona was therefore oversight on one page and not the next, and the resulting blank
 * page read as a deliberate narrowing rather than the scope bug it was.
 *
 * The predicate is asserted per persona here because that divergence is invisible from
 * either page's own tests - each was internally consistent.
 */
const flags = (over: Record<string, boolean>) =>
  ({
    isAdmin: false,
    isSubAdmin: false,
    isTutor: false,
    isMentor: false,
    hasMentorAuthority: false,
    isStudent: false,
    ...over,
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(selectActiveClassIds).mockResolvedValue(['A', 'B', 'C'])
})

describe('mentoringScopeClassIds', () => {
  it('gives a SUB-ADMIN every active class - the case that used to come back empty', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(flags({ isSubAdmin: true }))
    expect(await mentoringScopeClassIds({ id: 'sa-1' })).toEqual(['A', 'B', 'C'])
  })

  it('gives an ADMIN every active class', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(flags({ isAdmin: true }))
    expect(await mentoringScopeClassIds({ id: 'a-1' })).toEqual(['A', 'B', 'C'])
  })

  it('scopes a MENTOR to their mentees’ classes, never the whole academy', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(flags({ isMentor: true, hasMentorAuthority: true }))
    expect(await mentoringScopeClassIds({ id: 'm-1' })).toEqual(['MENTEE-CLASS'])
    expect(selectActiveClassIds).not.toHaveBeenCalled()
  })

  it('scopes a TUTOR-WHO-MENTORS by mentorship, not by what they teach', async () => {
    // Holding mentor authority is what decides the branch - a tutor who also mentors is
    // still mentor-scoped here, so their own classes do not widen the view.
    vi.mocked(loadPersonaFlags).mockResolvedValue(flags({ isTutor: true, isMentor: true, hasMentorAuthority: true }))
    expect(await mentoringScopeClassIds({ id: 'tm-1' })).toEqual(['MENTEE-CLASS'])
    expect(selectActiveClassIds).not.toHaveBeenCalled()
  })
})
