import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/class-membership', () => ({
  selectActiveEnrollmentRowsForClass: vi.fn(),
  selectActiveClassIdsForStudent: vi.fn(),
}))
vi.mock('@/lib/services/classes/queries', () => ({ myClassScope: vi.fn(), listClassesByIds: vi.fn() }))
vi.mock('@/lib/data/subjects', () => ({ selectSubjectsByIds: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))

import { selectActiveEnrollmentRowsForClass, selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { myClassScope, listClassesByIds } from '@/lib/services/classes/queries'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { getProfileNamesByIds } from '@/lib/services/users'
import { subjectSwitcherFor } from '@/lib/services/classes/subject-switcher'

const ME = { id: 'tutor-1' } as never

/** Maths (the class we are on), Physics (a sibling), Chemistry (taught by someone else). */
const MATHS = { id: 'c-maths', name: 'Sam - Maths', subject_id: 's-m', status: 'active' }
const PHYSICS = { id: 'c-phys', name: 'Sam - Physics', subject_id: 's-p', status: 'active' }
const CHEM = { id: 'c-chem', name: 'Sam - Chemistry', subject_id: 's-c', status: 'active' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectActiveEnrollmentRowsForClass).mockResolvedValue([{ id: 'e1', student_id: 'stu-1' }] as never)
  vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c-maths', 'c-phys', 'c-chem'] as never)
  vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['stu-1', 'Sam']]) as never)
  vi.mocked(selectSubjectsByIds).mockResolvedValue([
    { id: 's-m', name: 'Mathematics' },
    { id: 's-p', name: 'Physics' },
    { id: 's-c', name: 'Chemistry' },
  ] as never)
})

describe('subjectSwitcherFor', () => {
  /**
   * The whole point of the switcher: a student's OTHER subjects, reachable from the one you
   * are on. Everything else in this file exists because that list must never include a
   * subject the viewer does not teach.
   */
  it('offers the student other subjects, with the current one marked', async () => {
    vi.mocked(myClassScope).mockResolvedValue(['c-maths', 'c-phys'] as never)
    vi.mocked(listClassesByIds).mockResolvedValue([MATHS, PHYSICS] as never)

    const switcher = await subjectSwitcherFor(ME, 'c-maths')

    expect(switcher?.studentName).toBe('Sam')
    expect(switcher?.options.map((o) => o.label)).toEqual(['Mathematics', 'Physics'])
    expect(switcher?.options.find((o) => o.current)?.classId).toBe('c-maths')
  })

  /**
   * A student is commonly taught by several tutors. The switcher pivots on the STUDENT, so
   * without the scope intersection it would hand every tutor a link into a colleague's
   * class - a leak created by the navigation rather than by any policy change.
   */
  it('EXCLUDES a subject the viewer does not teach', async () => {
    vi.mocked(myClassScope).mockResolvedValue(['c-maths', 'c-phys'] as never)
    vi.mocked(listClassesByIds).mockResolvedValue([MATHS, PHYSICS] as never)

    const switcher = await subjectSwitcherFor(ME, 'c-maths')

    expect(switcher?.options.map((o) => o.classId)).not.toContain('c-chem')
    // and the class ids it asked to load never included the unscoped one
    expect(vi.mocked(listClassesByIds).mock.calls[0][0]).toEqual(['c-maths', 'c-phys'])
  })

  it('gives an ADMIN (null scope, meaning academy-wide) every subject', async () => {
    vi.mocked(myClassScope).mockResolvedValue(null as never)
    vi.mocked(listClassesByIds).mockResolvedValue([MATHS, PHYSICS, CHEM] as never)

    const switcher = await subjectSwitcherFor(ME, 'c-maths')

    expect(switcher?.options.map((o) => o.label)).toEqual(['Chemistry', 'Mathematics', 'Physics'])
  })

  it('returns null when the student has only this one subject - nothing to switch to', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c-maths'] as never)
    vi.mocked(myClassScope).mockResolvedValue(['c-maths'] as never)
    vi.mocked(listClassesByIds).mockResolvedValue([MATHS] as never)

    expect(await subjectSwitcherFor(ME, 'c-maths')).toBeNull()
  })

  /**
   * The switcher names ONE student, so it only means anything on a class that has exactly
   * one. A group class would otherwise pivot on whichever enrolment happened to sort first
   * and quietly present another student's subjects as this class's siblings.
   */
  it('returns null for a class that is not one student (group, or studentless)', async () => {
    vi.mocked(myClassScope).mockResolvedValue(null as never)

    vi.mocked(selectActiveEnrollmentRowsForClass).mockResolvedValue([
      { id: 'e1', student_id: 'stu-1' },
      { id: 'e2', student_id: 'stu-2' },
    ] as never)
    expect(await subjectSwitcherFor(ME, 'c-maths')).toBeNull()

    vi.mocked(selectActiveEnrollmentRowsForClass).mockResolvedValue([] as never)
    expect(await subjectSwitcherFor(ME, 'c-maths')).toBeNull()
  })

  /** C12 has no subject_id. Falling back to the class name keeps it selectable and named,
   *  rather than rendering a blank option the reader cannot identify. */
  it('falls back to the class name when a class has no subject set', async () => {
    const noSubject = { id: 'c-12', name: 'C12', subject_id: null, status: 'active' }
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c-maths', 'c-12'] as never)
    vi.mocked(myClassScope).mockResolvedValue(['c-maths', 'c-12'] as never)
    vi.mocked(listClassesByIds).mockResolvedValue([MATHS, noSubject] as never)

    const switcher = await subjectSwitcherFor(ME, 'c-maths')

    expect(switcher?.options.map((o) => o.label)).toEqual(['C12', 'Mathematics'])
  })

  it('leaves out an archived sibling, which is not somewhere to navigate to', async () => {
    const archived = { ...PHYSICS, status: 'archived' }
    vi.mocked(myClassScope).mockResolvedValue(['c-maths', 'c-phys'] as never)
    vi.mocked(listClassesByIds).mockResolvedValue([MATHS, archived] as never)

    expect(await subjectSwitcherFor(ME, 'c-maths')).toBeNull()
  })
})
