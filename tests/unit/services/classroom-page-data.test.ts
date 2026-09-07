import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ myClassIds: vi.fn(), listMyClasses: vi.fn() }))
vi.mock('@/lib/services/tags', () => ({ entityIdsForTag: vi.fn(), tagsForEntities: vi.fn() }))
vi.mock('@/lib/data/profiles-directory', () => ({ selectProfilePage: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({
  selectClassesByIdsAsCaller: vi.fn(),
  selectClassIdsBySubject: vi.fn(),
  selectVisibleClassIds: vi.fn(),
}))
vi.mock('@/lib/data/class-membership', () => ({
  countActiveEnrollmentsPerClass: vi.fn(),
  selectActiveEnrollmentPairsByStudentIds: vi.fn(),
  selectActiveStudentIdsByClassIds: vi.fn(),
  selectActiveTutorPairsByClassIds: vi.fn(),
}))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))

import { loadPersonaFlags } from '@/lib/permission/personas'
import { myClassIds, listMyClasses } from '@/lib/services/classes'
import { entityIdsForTag, tagsForEntities } from '@/lib/services/tags'
import { selectProfilePage } from '@/lib/data/profiles-directory'
import { selectClassesByIdsAsCaller, selectClassIdsBySubject, selectVisibleClassIds } from '@/lib/data/classes'
import {
  countActiveEnrollmentsPerClass,
  selectActiveEnrollmentPairsByStudentIds,
  selectActiveStudentIdsByClassIds,
  selectActiveTutorPairsByClassIds,
} from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import { loadClassroomPageData, classroomUrl } from '@/lib/services/page-data/classroom'

/**
 * The Classes list pages by STUDENT because its staff views group classes under the student
 * they are for, ordered by that student's name - an ordering that lives in profiles and
 * enrollments, not on `classes`.
 *
 * Two properties carry the security and correctness weight, and neither is visible from the
 * rendered page: an academy-wide reader must NOT travel as a list of every student id (that
 * is one uuid per student in a URL), and the classes shown must come back through the
 * CALLER'S own session, so the list can never offer a link the detail page would refuse.
 */

const ME = { id: 'me' } as never
const SUBJ = 'subject-1'

function flags(over: Record<string, boolean>) {
  vi.mocked(loadPersonaFlags).mockResolvedValue({
    isClassAdmin: false,
    isStudent: false,
    isTutor: false,
    ...over,
  } as never)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(tagsForEntities).mockResolvedValue(new Map())
  vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['s1', 'Aarav']]))
  vi.mocked(selectProfilePage).mockResolvedValue({ items: [], total: 0 } as never)
  vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValue([])
  vi.mocked(selectActiveTutorPairsByClassIds).mockResolvedValue([])
  vi.mocked(selectClassesByIdsAsCaller).mockResolvedValue([])
  vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValue([])
  vi.mocked(myClassIds).mockResolvedValue([])
  // No orphan classes by default: every visible class has an active enrolment.
  vi.mocked(selectVisibleClassIds).mockResolvedValue(['c1'])
  vi.mocked(countActiveEnrollmentsPerClass).mockResolvedValue(new Map([['c1', 1]]))
})

describe('classroom roster scope', () => {
  it('an academy-wide reader is NOT restricted by an id list', async () => {
    // Passing every student id would put one uuid per student in the roster query's URL,
    // which is the very thing paging by student exists to avoid.
    flags({ isClassAdmin: true })
    await loadClassroomPageData(ME, {})
    expect(vi.mocked(selectProfilePage).mock.calls[0][1].ids).toBeUndefined()
    expect(myClassIds).not.toHaveBeenCalled()
  })

  it('a tutor or mentor is restricted to the students of their own classes', async () => {
    flags({ isTutor: true })
    vi.mocked(myClassIds).mockResolvedValue(['c1', 'c2'])
    vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValue(['s1', 's2', 's1'])
    await loadClassroomPageData(ME, {})
    // De-duplicated: a student in two of the tutor's classes must not appear twice.
    expect(vi.mocked(selectProfilePage).mock.calls[0][1].ids).toEqual(['s1', 's2'])
  })

  it('orders and searches the roster in SQL', async () => {
    flags({ isClassAdmin: true })
    await loadClassroomPageData(ME, { q: 'aarav' })
    expect(selectProfilePage).toHaveBeenCalledWith(
      'student',
      expect.objectContaining({ search: 'aarav', sortBy: 'name', sortOrder: 'asc' }),
    )
  })
})

describe('classroom filters narrow the ROSTER, not just the cards', () => {
  it('a subject filter restricts which students appear', async () => {
    // Without this a page could be filled with students whose classes all fell out of the
    // filter, rendering as a run of empty headings.
    flags({ isClassAdmin: true })
    vi.mocked(selectClassIdsBySubject).mockResolvedValue(['c1'])
    vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValue(['s1'])
    await loadClassroomPageData(ME, { subject: SUBJ })
    expect(selectClassIdsBySubject).toHaveBeenCalledWith(SUBJ)
    expect(vi.mocked(selectProfilePage).mock.calls[0][1].ids).toEqual(['s1'])
  })

  it('subject AND tag combine as an intersection, not a union', async () => {
    flags({ isClassAdmin: true })
    vi.mocked(selectClassIdsBySubject).mockResolvedValue(['c1', 'c2'])
    vi.mocked(entityIdsForTag).mockResolvedValue(['c2', 'c3'])
    vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValue(['s1'])
    await loadClassroomPageData(ME, { subject: SUBJ, tag: 't1' })
    expect(vi.mocked(selectActiveStudentIdsByClassIds).mock.calls[0][0]).toEqual(['c2'])
  })

  it('reads neither filter source when no filter is applied', async () => {
    flags({ isClassAdmin: true })
    await loadClassroomPageData(ME, {})
    expect(selectClassIdsBySubject).not.toHaveBeenCalled()
    expect(entityIdsForTag).not.toHaveBeenCalled()
  })
})

describe('classroom groups are gated by RLS, not by a precomputed list', () => {
  beforeEach(() => {
    flags({ isClassAdmin: true })
    vi.mocked(selectProfilePage).mockResolvedValue({
      items: [{ id: 's1', full_name: 'Aarav', email: 'a@x.c' }],
      total: 1,
    } as never)
    vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValue([
      { student_id: 's1', class_id: 'c1' },
      { student_id: 's1', class_id: 'c2' },
    ] as never)
  })

  it("drops a class the caller's own session cannot read", async () => {
    // The list used to pre-resolve every readable class so a link could never 404. A page of
    // students cannot use a precomputed set, so RLS is applied directly - and a class the
    // caller may not open must not appear as a card.
    vi.mocked(selectClassesByIdsAsCaller).mockResolvedValue([{ id: 'c1', name: 'Maths' }] as never)
    const data = await loadClassroomPageData(ME, {})
    expect(data.groups[0].classes.map((c) => c.id)).toEqual(['c1'])
  })

  it('keeps a student with no classes when NO filter is applied', async () => {
    // "Enrolled in nothing yet" is a real state an admin needs to see.
    vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValue([])
    const data = await loadClassroomPageData(ME, {})
    expect(data.groups.map((g) => g.label)).toEqual(['Aarav'])
    expect(data.groups[0].classes).toEqual([])
  })

  it('drops a student left with nothing once a FILTER is applied', async () => {
    vi.mocked(selectClassIdsBySubject).mockResolvedValue(['c9'])
    vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValue(['s1'])
    vi.mocked(selectClassesByIdsAsCaller).mockResolvedValue([])
    const data = await loadClassroomPageData(ME, { subject: SUBJ })
    expect(data.groups).toEqual([])
  })
})

describe('a student sees their own flat list, with no roster read', () => {
  it('does not page and does not touch the student directory', async () => {
    flags({ isStudent: true })
    vi.mocked(listMyClasses).mockResolvedValue([{ id: 'c1', name: 'Maths' }] as never)
    const data = await loadClassroomPageData(ME, {})
    expect(selectProfilePage).not.toHaveBeenCalled()
    expect(data.groupByStudentView).toBe(false)
    expect(data.ownClasses.map((c) => c.id)).toEqual(['c1'])
  })
})

describe('classroomUrl', () => {
  const base = { page: 1, tag: '', subject: '', q: '' }

  it('an unfiltered first page is the bare path', () => {
    expect(classroomUrl(base)).toBe('/classroom')
  })

  it('carries the filters through a page change', () => {
    const url = classroomUrl({ ...base, subject: SUBJ, q: 'aarav' }, { page: 2 })
    expect(url).toContain('subject=' + SUBJ)
    expect(url).toContain('q=aarav')
    expect(url).toContain('page=2')
  })
})

describe('classes with NO active student still appear', () => {
  // Paging by student cannot reach a class that belongs to no student, so without a
  // dedicated pass they vanish from the list entirely - and unenrolling a student
  // (deactivateEnrollment) is an ordinary admin action, so the state is reachable.
  beforeEach(() => {
    flags({ isClassAdmin: true })
    vi.mocked(selectVisibleClassIds).mockResolvedValue(['c1', 'orphan'])
    vi.mocked(countActiveEnrollmentsPerClass).mockResolvedValue(new Map([['c1', 1]]))
    vi.mocked(selectClassesByIdsAsCaller).mockResolvedValue([{ id: 'orphan', name: 'Physics 1:1' }] as never)
  })

  it('surfaces a class whose only student was unenrolled', async () => {
    const data = await loadClassroomPageData(ME, {})
    expect(data.unassigned.map((c) => c.id)).toEqual(['orphan'])
    expect(data.unassigned[0].studentCount).toBe(0)
  })

  it('shows them on page 1 only - they belong to no page of the roster', async () => {
    // The roster must really HAVE a page 2, or clampPage folds the request back to page 1
    // (correctly) and the section reappears - which is what a shorter fixture asserted by
    // accident the first time this was written.
    vi.mocked(selectProfilePage).mockResolvedValue({ items: [], total: 40 } as never)
    const data = await loadClassroomPageData(ME, { page: '2' })
    expect(data.filters.page).toBe(2)
    expect(data.unassigned).toEqual([])
    expect(selectVisibleClassIds).not.toHaveBeenCalled()
  })

  it('reappears when a page past the end is folded back to page 1', async () => {
    vi.mocked(selectProfilePage).mockResolvedValue({ items: [], total: 3 } as never)
    const data = await loadClassroomPageData(ME, { page: '9' })
    expect(data.filters.page).toBe(1)
    expect(data.unassigned.map((c) => c.id)).toEqual(['orphan'])
  })

  it('a STUDENT-name search correctly excludes them', async () => {
    // They have no student, so they can never match a search for one.
    const data = await loadClassroomPageData(ME, { q: 'aarav' })
    expect(data.unassigned).toEqual([])
  })

  it('a subject filter still applies to them', async () => {
    vi.mocked(selectClassIdsBySubject).mockResolvedValue(['c1'])
    vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValue([])
    const data = await loadClassroomPageData(ME, { subject: SUBJ })
    // 'orphan' is not in the subject's class set, so it drops out like any other class.
    expect(data.unassigned).toEqual([])
  })

  it('a student view never asks for them', async () => {
    flags({ isStudent: true })
    vi.mocked(listMyClasses).mockResolvedValue([] as never)
    const data = await loadClassroomPageData(ME, {})
    expect(data.unassigned).toEqual([])
    expect(selectVisibleClassIds).not.toHaveBeenCalled()
  })
})
