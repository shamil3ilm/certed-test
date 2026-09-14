import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/subjects', () => ({ selectSubjectsByIds: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({
  selectActiveEnrollmentPairsByClassIds: vi.fn(),
  selectAllActiveEnrollmentPairs: vi.fn(),
}))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))
vi.mock('@/lib/data/profiles-directory', () => ({ selectProfilesByFilter: vi.fn() }))

import { selectSubjectsByIds } from '@/lib/data/subjects'
import { selectActiveEnrollmentPairsByClassIds, selectAllActiveEnrollmentPairs } from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import { selectProfilesByFilter } from '@/lib/data/profiles-directory'
import { classLabel, resolveClassLabels, withClassLabels } from '@/lib/services/classes/class-labels'

/**
 * A class's stored `name` is a "Student - Subject" string written once, when the class is
 * created. Renaming the student does not touch it, and setting a missing subject does not
 * either - so a screen that prints it prints a snapshot, and prints the student a second time
 * wherever the page has already named them. These labels are resolved from the student and
 * subject tables at read time instead, in the two forms screens need.
 */

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectSubjectsByIds).mockResolvedValue([
    { id: 's-bio', name: 'Biology' },
    { id: 's-math', name: 'Mathematics' },
  ] as never)
})

describe('classLabel (the rule)', () => {
  const BIO = { name: 'Sam - Biology', subject_id: 's-bio' }
  const C12 = { name: 'C12', subject_id: null }

  it("'subject' names the subject, where the student is already named by the page", () => {
    expect(classLabel(BIO, 'Biology', 'Sam', 'subject')).toBe('Biology')
  })

  it("'subject' falls back to the stored name when no subject is set", () => {
    expect(classLabel(C12, null, 'Sam', 'subject')).toBe('C12')
  })

  it("'student-subject' names both, where the page does not say whose class it is", () => {
    expect(classLabel(BIO, 'Biology', 'Sam', 'student-subject')).toBe('Sam - Biology')
  })

  it('reads the LIVE student, so a renamed student is not shown under their old name', () => {
    const stale = { name: 'Samuel Old - Biology', subject_id: 's-bio' }
    expect(classLabel(stale, 'Biology', 'Sam New', 'student-subject')).toBe('Sam New - Biology')
  })

  it('pairs the student with the stored name when the class has no subject', () => {
    expect(classLabel(C12, null, 'Sam', 'student-subject')).toBe('Sam - C12')
  })

  it('does not print the student twice when a subject-less stored name already leads with them', () => {
    // A subject deleted from the catalogue leaves subject_id null on a "Student - Subject" name.
    expect(classLabel({ name: 'Sam - Maths', subject_id: null }, null, 'Sam', 'student-subject')).toBe('Sam - Maths')
  })

  it('keeps the stored name for a class that is not one student (group, or none)', () => {
    expect(classLabel({ name: 'Grade 8 revision', subject_id: 's-bio' }, 'Biology', null, 'student-subject')).toBe(
      'Grade 8 revision',
    )
  })
})

describe('resolveClassLabels', () => {
  const ROWS = [
    { id: 'c-bio', name: 'Sam - Biology', subject_id: 's-bio' },
    { id: 'c-12', name: 'C12', subject_id: null },
    { id: 'c-group', name: 'Revision group', subject_id: 's-math' },
  ]

  it("'subject' reads subject names only - never enrolments or people", async () => {
    const labels = await resolveClassLabels(ROWS, 'subject')

    expect(labels.get('c-bio')).toBe('Biology')
    expect(labels.get('c-12')).toBe('C12')
    expect(selectSubjectsByIds).toHaveBeenCalledWith(['s-bio', 's-math'])
    expect(selectActiveEnrollmentPairsByClassIds).not.toHaveBeenCalled()
    expect(selectAllActiveEnrollmentPairs).not.toHaveBeenCalled()
    expect(getProfileNamesByIds).not.toHaveBeenCalled()
  })

  it('reads nothing at all for an empty list', async () => {
    expect((await resolveClassLabels([], 'student-subject')).size).toBe(0)
    expect(selectSubjectsByIds).not.toHaveBeenCalled()
    expect(selectActiveEnrollmentPairsByClassIds).not.toHaveBeenCalled()
  })

  it("'student-subject' on a BOUNDED set asks by class id and names only single-student classes", async () => {
    vi.mocked(selectActiveEnrollmentPairsByClassIds).mockResolvedValue([
      { student_id: 'stu-sam', class_id: 'c-bio' },
      { student_id: 'stu-sam', class_id: 'c-12' },
      { student_id: 'stu-a', class_id: 'c-group' },
      { student_id: 'stu-b', class_id: 'c-group' },
    ] as never)
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['stu-sam', 'Sam']]) as never)

    const labels = await resolveClassLabels(ROWS, 'student-subject')

    expect(labels.get('c-bio')).toBe('Sam - Biology')
    expect(labels.get('c-12')).toBe('Sam - C12')
    expect(labels.get('c-group')).toBe('Revision group')
    // the group's students are never looked up - their names would name nothing
    expect(getProfileNamesByIds).toHaveBeenCalledWith(['stu-sam'])
    expect(selectAllActiveEnrollmentPairs).not.toHaveBeenCalled()
    expect(selectProfilesByFilter).not.toHaveBeenCalled()
  })

  /**
   * The admin calendar picker lists every class in the academy. Resolving its students by id
   * would send that whole set as one `.in()` list - too long for a URL, and silently cut at
   * the row cap. The academy-wide path reads both sides whole, in pages, and never builds one.
   */
  it("'student-subject' ACADEMY-WIDE reads enrolments and students whole, never by id list", async () => {
    vi.mocked(selectAllActiveEnrollmentPairs).mockResolvedValue([{ student_id: 'stu-sam', class_id: 'c-bio' }] as never)
    vi.mocked(selectProfilesByFilter).mockResolvedValue([
      { id: 'stu-sam', full_name: 'Sam', email: 'sam@x.test' },
      { id: 'stu-other', full_name: null, email: 'other@x.test' },
    ] as never)

    const labels = await resolveClassLabels(ROWS, 'student-subject', { academyWide: true })

    expect(labels.get('c-bio')).toBe('Sam - Biology')
    expect(selectProfilesByFilter).toHaveBeenCalledWith({ role: 'student' })
    expect(selectActiveEnrollmentPairsByClassIds).not.toHaveBeenCalled()
    expect(getProfileNamesByIds).not.toHaveBeenCalled()
  })

  it('names a student with no full name by their email, as everywhere else', async () => {
    vi.mocked(selectAllActiveEnrollmentPairs).mockResolvedValue([
      { student_id: 'stu-other', class_id: 'c-bio' },
    ] as never)
    vi.mocked(selectProfilesByFilter).mockResolvedValue([
      { id: 'stu-other', full_name: null, email: 'other@x.test' },
    ] as never)

    const labels = await resolveClassLabels(ROWS, 'student-subject', { academyWide: true })

    expect(labels.get('c-bio')).toBe('other@x.test - Biology')
  })
})

describe('withClassLabels', () => {
  it('returns NEW rows with the label as name, leaving every other field and the input untouched', async () => {
    const input = [{ id: 'c-bio', name: 'Sam - Biology', subject_id: 's-bio', status: 'active' as const }]

    const out = await withClassLabels(input, 'subject')

    expect(out).toEqual([{ id: 'c-bio', name: 'Biology', subject_id: 's-bio', status: 'active' }])
    expect(out[0]).not.toBe(input[0])
    expect(input[0].name).toBe('Sam - Biology')
  })
})
