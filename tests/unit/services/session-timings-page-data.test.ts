import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/mentor-session-timings', () => ({
  listMenteeSessionTimings: vi.fn(),
  listSessionTimingsByStudents: vi.fn(),
}))
vi.mock('@/lib/data/subjects', () => ({ selectActiveSubjects: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({
  selectActiveClassIdsForStudent: vi.fn(),
  selectActiveStudentIdsByClassIds: vi.fn(),
}))
vi.mock('@/lib/data/profiles-directory', () => ({ selectProfilePage: vi.fn() }))
vi.mock('@/lib/permission/class', () => ({
  mentoringScopeClassIds: vi.fn(),
  isMentoringOversight: vi.fn(),
}))
vi.mock('@/lib/services/users', () => ({ listActiveByRole: vi.fn() }))

import { listMenteeSessionTimings, listSessionTimingsByStudents } from '@/lib/services/mentor-session-timings'
import { selectActiveSubjects } from '@/lib/data/subjects'
import { selectActiveClassIdsForStudent, selectActiveStudentIdsByClassIds } from '@/lib/data/class-membership'
import { selectProfilePage } from '@/lib/data/profiles-directory'
import { mentoringScopeClassIds, isMentoringOversight } from '@/lib/permission/class'
import { listActiveByRole } from '@/lib/services/users'
import { loadSessionTimingsPageData, sessionTimingsUrl } from '@/lib/services/page-data/session-timings'

/**
 * The session-timing page has TWO shapes and the tests have to cover both, because the
 * bugs live at the seam:
 *
 *   - GROUPED (default) - a page of STUDENTS, each showing their latest few sessions. The
 *     pager counts students, so a student's sessions can never be split across pages.
 *   - FLAT (a student filter is set) - that one student's full history, newest first, paged
 *     by session. This is what a group's "See all" opens, and it is the reason the group
 *     can afford to cap at all.
 *
 * The filters come straight off the URL either way, so this is also where a hand-edited or
 * stale query string is either made harmless or turned into an error page. Two rules carry
 * the weight: a malformed value is DROPPED rather than forwarded to PostgREST (which answers
 * a bad uuid with a 400), and a student filter that resolves to no classes must mean "no
 * matches" rather than falling through to the unfiltered list.
 */

const ACTOR = { id: 'me' } as never
const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

const roster = (items: { id: string }[], total = items.length) => ({ items, total }) as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listMenteeSessionTimings).mockResolvedValue({ items: [], total: 0 })
  vi.mocked(listSessionTimingsByStudents).mockResolvedValue([])
  vi.mocked(selectActiveSubjects).mockResolvedValue([{ id: UUID_A, name: 'Algebra' }] as never)
  vi.mocked(listActiveByRole).mockResolvedValue([] as never)
  vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c1'])
  vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValue(['s1'])
  vi.mocked(mentoringScopeClassIds).mockResolvedValue(['c1'])
  vi.mocked(isMentoringOversight).mockResolvedValue(true)
  vi.mocked(selectProfilePage).mockResolvedValue(roster([{ id: 's1' }]))
})

/** The filters the grouped view actually pushed down into its per-student reads. */
const groupedFilters = () => vi.mocked(listSessionTimingsByStudents).mock.calls[0][1].filters ?? {}

describe('session-timings filters: a malformed URL narrows nothing, it does not error', () => {
  it.each([
    ['subject', 'not-a-uuid'],
    ['tutor', "'; drop table class_sessions;--"],
    ['student', '12345'],
    ['classId', 'null'],
  ])('drops a malformed %s rather than passing it to the query', async (key, value) => {
    const data = await loadSessionTimingsPageData(ACTOR, { [key]: value })
    expect(data.filters[key as 'subject']).toBe('')
    expect(data.hasActiveFilters).toBe(false)
    expect(Object.values(groupedFilters()).filter((v) => v !== undefined)).toEqual([])
  })

  it.each([
    ['from', '05-08-2026'],
    ['to', '2026-13-45'],
    ['from', 'yesterday'],
  ])('drops a malformed date in %s', async (key, value) => {
    const data = await loadSessionTimingsPageData(ACTOR, { [key]: value })
    expect(data.filters[key as 'from']).toBe('')
  })

  it('keeps well-formed values and forwards them INTO the groups', async () => {
    // The point of the grouped view: filtering happens inside each student's read, not as
    // a pass over rows already chosen. If these stopped being forwarded, every group would
    // quietly show unfiltered sessions under a filter bar claiming otherwise.
    const data = await loadSessionTimingsPageData(ACTOR, {
      subject: UUID_A,
      tutor: UUID_B,
      from: '2026-08-01',
      to: '2026-08-31',
    })
    expect(data.hasActiveFilters).toBe(true)
    expect(groupedFilters()).toMatchObject({
      subjectId: UUID_A,
      tutorId: UUID_B,
      from: '2026-08-01',
      to: '2026-08-31',
    })
  })
})

describe('session-timings: grouped view (the default)', () => {
  it('groups by student and pages the ROSTER, not the sessions', async () => {
    vi.mocked(selectProfilePage).mockResolvedValue(roster([{ id: 's1' }, { id: 's2' }], 30))
    vi.mocked(listSessionTimingsByStudents).mockResolvedValue([
      { studentId: 's1', studentName: 'Ann', sessions: [], total: 9 },
      { studentId: 's2', studentName: 'Bo', sessions: [], total: 0 },
    ] as never)

    const data = await loadSessionTimingsPageData(ACTOR, {})

    expect(data.groupView).toBe(true)
    expect(data.items).toEqual([])
    expect(data.groups.map((g) => g.studentId)).toEqual(['s1', 's2'])
    // 30 STUDENTS over a 12-student page - not 30 sessions.
    expect(data.total).toBe(30)
    expect(data.totalPages).toBe(3)
    expect(listMenteeSessionTimings).not.toHaveBeenCalled()
  })

  it('keeps a student whose sessions all filtered out, rather than dropping the group', async () => {
    // Dropping it would make the roster pager claim a page size it is not rendering. The
    // group renders instead and says it matched nothing.
    vi.mocked(listSessionTimingsByStudents).mockResolvedValue([
      { studentId: 's1', studentName: 'Ann', sessions: [], total: 0 },
    ] as never)
    const data = await loadSessionTimingsPageData(ACTOR, { subject: UUID_A })
    expect(data.groups).toHaveLength(1)
    expect(data.groups[0].total).toBe(0)
  })

  it('reports the TRUE total for a group without fetching sessions the roster never renders', async () => {
    // The roster is a list of students; a student's sessions open when they are chosen. So
    // the count has to be the real one - a year of daily sessions is still 240, not the
    // number of rows that came back - and the read must not pull rows to reach it.
    vi.mocked(listSessionTimingsByStudents).mockResolvedValue([
      { studentId: 's1', studentName: 'Ann', sessions: [{}], total: 240 },
    ] as never)
    const data = await loadSessionTimingsPageData(ACTOR, {})
    expect(data.groups[0].total).toBe(240)
    // One row per student is the floor the paged read needs to return a count at all;
    // anything above it is a row per student per page that nothing puts on screen.
    expect(vi.mocked(listSessionTimingsByStudents).mock.calls[0][1].perStudent).toBe(1)
  })

  it('an ADMIN pages every student, and does not travel as a list of every student id', async () => {
    // One uuid per student in the roster query URL is the failure this avoids.
    vi.mocked(isMentoringOversight).mockResolvedValue(true)
    await loadSessionTimingsPageData(ACTOR, {})
    expect(vi.mocked(selectProfilePage).mock.calls[0][1].ids).toBeUndefined()
    expect(selectActiveStudentIdsByClassIds).not.toHaveBeenCalled()
  })

  it("a MENTOR pages only their own mentees' students", async () => {
    vi.mocked(isMentoringOversight).mockResolvedValue(false)
    vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValue(['s7', 's7', 's8'])
    await loadSessionTimingsPageData(ACTOR, {})
    // De-duplicated: a student in two of the mentor's classes is one roster entry.
    expect(vi.mocked(selectProfilePage).mock.calls[0][1].ids).toEqual(['s7', 's8'])
  })

  it('folds a roster page past the end back onto the last real page', async () => {
    vi.mocked(selectProfilePage).mockResolvedValue(roster([{ id: 's1' }], 25))
    const data = await loadSessionTimingsPageData(ACTOR, { page: '999' })
    expect(data.filters.page).toBe(3)
    expect(vi.mocked(selectProfilePage).mock.calls.map((c) => c[1].page)).toEqual([999, 3])
  })

  it('does not re-read the roster when the requested page is already in range', async () => {
    vi.mocked(selectProfilePage).mockResolvedValue(roster([{ id: 's1' }], 100))
    await loadSessionTimingsPageData(ACTOR, { page: '2' })
    expect(selectProfilePage).toHaveBeenCalledTimes(1)
  })
})

describe('session-timings: the student filter drills into the FLAT history', () => {
  it("narrows to the student's own classes and leaves the grouped view", async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c1', 'c2'])
    const data = await loadSessionTimingsPageData(ACTOR, { student: UUID_A })
    expect(data.groupView).toBe(false)
    expect(data.groups).toEqual([])
    expect(vi.mocked(listMenteeSessionTimings).mock.calls[0][1].filters?.studentClassIds).toEqual(['c1', 'c2'])
    // No roster is paged in the flat view - the reader has already picked the student.
    expect(selectProfilePage).not.toHaveBeenCalled()
  })

  it('a student with NO active class matches nothing, rather than showing every session', async () => {
    // Dropping an empty array would leave the query unfiltered - the filter would appear to
    // be applied while quietly showing the whole list.
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue([])
    const data = await loadSessionTimingsPageData(ACTOR, { student: UUID_A })
    expect(listMenteeSessionTimings).not.toHaveBeenCalled()
    expect(data.items).toEqual([])
    expect(data.total).toBe(0)
  })

  it('pages by SESSION here, and folds a page past the end back', async () => {
    vi.mocked(listMenteeSessionTimings).mockResolvedValue({ items: [], total: 25 })
    const data = await loadSessionTimingsPageData(ACTOR, { student: UUID_A, page: '999' })
    expect(data.filters.page).toBe(2)
    expect(vi.mocked(listMenteeSessionTimings).mock.calls.map((c) => c[1].page)).toEqual([999, 2])
  })
})

describe('sessionTimingsUrl', () => {
  const base = { page: 1, student: '', subject: '', tutor: '', classId: '', from: '', to: '' }

  it('an unfiltered first page is the bare path', () => {
    expect(sessionTimingsUrl(base)).toBe('/session-timings')
  })

  it('carries every active filter through a page change', () => {
    // Paging must not silently drop a filter - the reader would think the list changed.
    const url = sessionTimingsUrl({ ...base, subject: UUID_A, tutor: UUID_B, from: '2026-08-01' }, { page: 3 })
    expect(url).toContain('subject=' + UUID_A)
    expect(url).toContain('tutor=' + UUID_B)
    expect(url).toContain('from=2026-08-01')
    expect(url).toContain('page=3')
  })

  it("a group's See all link carries the filters into the flat view", () => {
    // The drill-in must stay narrowed, or "See all" silently widens what the reader is
    // looking at the moment they click it.
    const url = sessionTimingsUrl({ ...base, subject: UUID_A, from: '2026-08-01' }, { student: 's1', page: 1 })
    expect(url).toContain('student=s1')
    expect(url).toContain('subject=' + UUID_A)
    expect(url).toContain('from=2026-08-01')
  })
})
