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
vi.mock('@/lib/data/subjects', () => ({ selectSubjectsByIds: vi.fn() }))

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
import { selectSubjectsByIds } from '@/lib/data/subjects'
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
const SUBJ = '11111111-1111-4111-8111-111111111111'
const TAG = '22222222-2222-4222-8222-222222222222'

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
  vi.mocked(selectSubjectsByIds).mockResolvedValue([])
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
    await loadClassroomPageData(ME, { subject: SUBJ, tag: TAG })
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

describe('a malformed filter narrows nothing rather than erroring', () => {
  // Both name a uuid column, and PostgREST answers a bad uuid with a 400 - so a stale
  // bookmark or a hand-edited URL would turn a filter into an error page. Dropping the
  // value shows the unfiltered list instead, which is what the reader meant.
  it.each([
    ['subject', 'not-a-uuid'],
    ['tag', "'; drop table classes;--"],
    ['subject', '12345'],
  ])('drops a malformed %s', async (key, value) => {
    flags({ isClassAdmin: true })
    const data = await loadClassroomPageData(ME, { [key]: value })
    expect(data.filters[key as 'subject']).toBe('')
    expect(data.hasActiveFilters).toBe(false)
    expect(selectClassIdsBySubject).not.toHaveBeenCalled()
    expect(entityIdsForTag).not.toHaveBeenCalled()
  })
})

describe('extras can be skipped by a caller that does not render them', () => {
  // /grading shares this loader for the roster and the grouping but renders neither the tag
  // chips nor the "not assigned to a student" section. Computing them there is round trips
  // whose results are discarded - the fetch-what-you-do-not-render shape this module exists
  // to avoid.
  it('skips the unassigned-classes pass and the tag lookup', async () => {
    flags({ isClassAdmin: true })
    vi.mocked(selectVisibleClassIds).mockResolvedValue(['c1', 'orphan'])
    vi.mocked(countActiveEnrollmentsPerClass).mockResolvedValue(new Map([['c1', 1]]))

    const data = await loadClassroomPageData(ME, {}, { extras: false })

    expect(data.unassigned).toEqual([])
    expect(data.tagsByClass.size).toBe(0)
    expect(selectVisibleClassIds).not.toHaveBeenCalled()
    expect(tagsForEntities).not.toHaveBeenCalled()
  })

  it('computes them by default, so the Classes list is unaffected', async () => {
    flags({ isClassAdmin: true })
    vi.mocked(selectVisibleClassIds).mockResolvedValue(['c1', 'orphan'])
    vi.mocked(countActiveEnrollmentsPerClass).mockResolvedValue(new Map([['c1', 1]]))
    vi.mocked(selectClassesByIdsAsCaller).mockResolvedValue([{ id: 'orphan', name: 'Physics' }] as never)

    const data = await loadClassroomPageData(ME, {})

    expect(data.unassigned.map((c) => c.id)).toEqual(['orphan'])
    expect(data.unassignedTotal).toBe(1)
    expect(data.unassignedTruncated).toBe(false)
    expect(tagsForEntities).toHaveBeenCalled()
  })

  /**
   * The section is a grid of cards, not a pager, and for an ADMIN the orphan set is drawn
   * from every class in the academy - so an academy seeded with classes before anyone is
   * enrolled makes it arbitrarily long. Both of its reads scope with `.in(ids)`, which is
   * ~37 bytes per uuid in the GET URL, so the list has to be capped.
   *
   * The trap the cap must avoid is the one Page<T> exists for: reporting the number of
   * cards RENDERED as the number that EXIST. That turns a short list into a wrong figure,
   * which no reader can detect. The total is computed from two complete reads before the
   * capped fetch, so it costs nothing to be right.
   */
  it('caps what it FETCHES but still reports how many there really are', async () => {
    flags({ isClassAdmin: true })
    const orphans = Array.from({ length: 30 }, (_, i) => `orphan-${i}`)
    vi.mocked(selectVisibleClassIds).mockResolvedValue(['c1', ...orphans])
    vi.mocked(countActiveEnrollmentsPerClass).mockResolvedValue(new Map([['c1', 1]]))
    vi.mocked(selectClassesByIdsAsCaller).mockImplementation(
      async (ids: string[]) => ids.map((id) => ({ id, name: id })) as never,
    )

    const data = await loadClassroomPageData(ME, {})

    // 24 fetched and rendered...
    expect(data.unassigned).toHaveLength(24)
    // ...but the section says there are 30, not 24.
    expect(data.unassignedTotal, 'the count must not collapse to the page length').toBe(30)
    expect(data.unassignedTruncated).toBe(true)
    // The uuid list actually sent must be the capped one, or capping bought nothing.
    expect(vi.mocked(selectClassesByIdsAsCaller).mock.calls[0][0]).toHaveLength(24)
    expect(vi.mocked(selectActiveTutorPairsByClassIds).mock.calls[0][0]).toHaveLength(24)
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

/**
 * Under a student heading the card should name the SUBJECT, because the class name is
 * `${student} - ${subject}` and the heading has already said the student. Rendering the
 * whole name there prints the student's name twice and pushes the subject - the one part
 * that differs between the cards - onto a second line.
 *
 * The subject is resolved rather than sliced off the front of the name: C12 does not follow
 * that naming convention, and string surgery on it would produce nonsense.
 */
describe('subject names for the grouped cards', () => {
  beforeEach(() => {
    flags({ isClassAdmin: true })
    vi.mocked(selectProfilePage).mockResolvedValue({
      items: [{ id: 's1', full_name: 'Aarav', email: 'a@x.c' }],
      total: 1,
    } as never)
    vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValue([
      { student_id: 's1', class_id: 'c1' },
    ] as never)
  })

  it('maps each class to its subject name', async () => {
    vi.mocked(selectClassesByIdsAsCaller).mockResolvedValue([
      { id: 'c1', name: 'Sam - Maths', subject_id: 's-m' },
    ] as never)
    vi.mocked(selectSubjectsByIds).mockResolvedValue([{ id: 's-m', name: 'Mathematics' }] as never)

    const data = await loadClassroomPageData(ME, {})

    expect(data.subjectByClass.get('c1')).toBe('Mathematics')
  })

  it('leaves a class with no subject unmapped, so the card falls back to its own name', async () => {
    vi.mocked(selectClassesByIdsAsCaller).mockResolvedValue([{ id: 'c1', name: 'C12', subject_id: null }] as never)

    const data = await loadClassroomPageData(ME, {})

    expect(data.subjectByClass.has('c1')).toBe(false)
    // and nothing was asked of the subjects table for a class that names no subject
    expect(selectSubjectsByIds).not.toHaveBeenCalled()
  })
})
