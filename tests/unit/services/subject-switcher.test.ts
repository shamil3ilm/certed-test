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
import { classIdentityFor, classHeader } from '@/lib/services/classes/subject-switcher'

const ME = { id: 'tutor-1' } as never

/** Maths (the class we are on), Physics (a sibling), Chemistry (taught by someone else). */
const MATHS = { id: 'c-maths', name: 'Sam - Maths', subject_id: 's-m', status: 'active' }
const PHYSICS = { id: 'c-phys', name: 'Sam - Physics', subject_id: 's-p', status: 'active' }
const CHEM = { id: 'c-chem', name: 'Sam - Chemistry', subject_id: 's-c', status: 'active' }

/** listClassesByIds returns only the rows it was asked for, like the real read. */
function classesFrom(rows: Array<{ id: string }>) {
  vi.mocked(listClassesByIds).mockImplementation(
    async (ids: string[]) => rows.filter((r) => ids.includes(r.id)) as never,
  )
}

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
  classesFrom([MATHS, PHYSICS, CHEM])
})

describe('classIdentityFor', () => {
  /**
   * The whole point of the switcher: a student's OTHER subjects, reachable from the one you
   * are on. Everything below the first test exists because that list must never include a
   * subject the viewer does not teach.
   */
  it('offers the student other subjects, with the current one marked', async () => {
    vi.mocked(myClassScope).mockResolvedValue(['c-maths', 'c-phys'] as never)

    const identity = await classIdentityFor(ME, 'c-maths')

    expect(identity?.studentName).toBe('Sam')
    expect(identity?.currentLabel).toBe('Mathematics')
    expect(identity?.options.map((o) => o.label)).toEqual(['Mathematics', 'Physics'])
    expect(identity?.options.find((o) => o.current)?.classId).toBe('c-maths')
  })

  /**
   * A student is commonly taught by several tutors. The lookup pivots on the STUDENT, so
   * without the scope intersection it would hand every tutor a link into a colleague's
   * class - a leak created by the navigation rather than by any policy change.
   */
  it('EXCLUDES a subject the viewer does not teach', async () => {
    vi.mocked(myClassScope).mockResolvedValue(['c-maths', 'c-phys'] as never)

    const identity = await classIdentityFor(ME, 'c-maths')

    expect(identity?.options.map((o) => o.classId)).not.toContain('c-chem')
    // and the classes it asked to load never included the unscoped one
    expect(vi.mocked(listClassesByIds).mock.calls[0][0]).not.toContain('c-chem')
  })

  it('gives an ADMIN (null scope, meaning academy-wide) every subject', async () => {
    vi.mocked(myClassScope).mockResolvedValue(null as never)

    const identity = await classIdentityFor(ME, 'c-maths')

    expect(identity?.options.map((o) => o.label)).toEqual(['Chemistry', 'Mathematics', 'Physics'])
  })

  /**
   * A tutor who teaches Sam ONE of Sam's three subjects has nothing to switch to, but still
   * needs to know whose class this is and in what subject. If the identity were derived from
   * the options, it would disappear with them, and the header would fall back to the stored
   * class name ("C12") while the same tutor's card for this class reads the subject - one
   * class, labelled two ways for one person.
   */
  it('still identifies the class for a tutor who teaches only this one of the student subjects', async () => {
    vi.mocked(myClassScope).mockResolvedValue(['c-maths'] as never)

    const identity = await classIdentityFor(ME, 'c-maths')

    expect(identity).not.toBeNull()
    expect(identity?.studentName).toBe('Sam')
    expect(identity?.currentLabel).toBe('Mathematics')
    // nothing to switch to, and still no link into the subjects they do not teach
    expect(identity?.options.map((o) => o.classId)).toEqual(['c-maths'])
  })

  it('identifies the class when the student has only this one subject', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c-maths'] as never)
    vi.mocked(myClassScope).mockResolvedValue(['c-maths'] as never)

    const identity = await classIdentityFor(ME, 'c-maths')

    expect(identity?.currentLabel).toBe('Mathematics')
    expect(identity?.options).toHaveLength(1)
  })

  /**
   * The identity names ONE student, so it only means anything on a class that has exactly
   * one. A group class would otherwise pivot on whichever enrolment happened to sort first
   * and quietly present another student as the person this class is for.
   */
  it('returns null for a class that is not one student (group, or studentless)', async () => {
    vi.mocked(myClassScope).mockResolvedValue(null as never)

    vi.mocked(selectActiveEnrollmentRowsForClass).mockResolvedValue([
      { id: 'e1', student_id: 'stu-1' },
      { id: 'e2', student_id: 'stu-2' },
    ] as never)
    expect(await classIdentityFor(ME, 'c-maths')).toBeNull()

    vi.mocked(selectActiveEnrollmentRowsForClass).mockResolvedValue([] as never)
    expect(await classIdentityFor(ME, 'c-maths')).toBeNull()
  })

  /** A class with no subject still has to be identifiable, so it keeps its own name - as the
   *  header's subject line and as an option - rather than rendering blank. */
  it('falls back to the class name when a class has no subject set', async () => {
    const noSubject = { id: 'c-12', name: 'C12', subject_id: null, status: 'active' }
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c-maths', 'c-12'] as never)
    vi.mocked(myClassScope).mockResolvedValue(['c-maths', 'c-12'] as never)
    classesFrom([MATHS, noSubject])

    expect((await classIdentityFor(ME, 'c-12'))?.currentLabel).toBe('C12')
    expect((await classIdentityFor(ME, 'c-maths'))?.options.map((o) => o.label)).toEqual(['C12', 'Mathematics'])
  })

  it('leaves an archived SIBLING out of the options, which is not somewhere to navigate to', async () => {
    vi.mocked(myClassScope).mockResolvedValue(['c-maths', 'c-phys'] as never)
    classesFrom([MATHS, { ...PHYSICS, status: 'archived' }])

    const identity = await classIdentityFor(ME, 'c-maths')

    expect(identity?.options.map((o) => o.classId)).toEqual(['c-maths'])
  })

  it('still identifies an archived class the reader is standing on', async () => {
    vi.mocked(myClassScope).mockResolvedValue(['c-maths', 'c-phys'] as never)
    classesFrom([{ ...MATHS, status: 'archived' }, PHYSICS])

    const identity = await classIdentityFor(ME, 'c-maths')

    expect(identity?.currentLabel).toBe('Mathematics')
    expect(identity?.options.find((o) => o.current)?.classId).toBe('c-maths')
  })
})

/**
 * What the class page's header says. Pure, so the rule is pinned here rather than only in a
 * layout nobody unit-tests - the rule that broke on staging.
 */
describe('classHeader', () => {
  const COURSE = { name: 'C12', status: 'active' }
  const IDENTITY = { studentName: 'Sam', currentLabel: 'Biology', options: [] }

  it('leads with the student and qualifies with the subject', () => {
    expect(classHeader(COURSE, IDENTITY)).toEqual({ title: 'Sam', description: 'Biology' })
  })

  it('does so even when there is nothing to switch to (options empty or single)', () => {
    const single = { ...IDENTITY, options: [{ classId: 'x', label: 'Biology', current: true }] }
    expect(classHeader(COURSE, single).title).toBe('Sam')
  })

  it('says a class is archived rather than naming its subject', () => {
    expect(classHeader({ ...COURSE, status: 'archived' }, IDENTITY)).toEqual({
      title: 'Sam',
      description: 'Archived class',
    })
  })

  it('falls back to the stored name only when there is no single student to lead with', () => {
    expect(classHeader(COURSE, null)).toEqual({ title: 'C12', description: 'Class' })
  })
})
