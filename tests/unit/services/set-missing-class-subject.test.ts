import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/data/subjects', () => ({ selectSubjectById: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({ updateClassSubjectWhenUnset: vi.fn(), selectClassesByIds: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({
  selectActiveClassIdsForStudent: vi.fn(),
  selectActiveEnrollmentRowsForClass: vi.fn(),
  selectActiveEnrollmentPairsByStudentIds: vi.fn(),
}))
vi.mock('@/lib/data/class-sessions', () => ({ backfillSessionSubjects: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/classes/lifecycle', () => ({ createClass: vi.fn(), archiveClass: vi.fn() }))
vi.mock('@/lib/services/enrollments', () => ({ enrolStudent: vi.fn() }))
vi.mock('@/lib/services/class-tutors', () => ({ addTutor: vi.fn() }))

import { requireActorCapability } from '@/lib/services/authorization'
import { canManageClass } from '@/lib/permission'
import { selectSubjectById } from '@/lib/data/subjects'
import { updateClassSubjectWhenUnset, selectClassesByIds } from '@/lib/data/classes'
import {
  selectActiveClassIdsForStudent,
  selectActiveEnrollmentRowsForClass,
  selectActiveEnrollmentPairsByStudentIds,
} from '@/lib/data/class-membership'
import { getProfileById } from '@/lib/services/users'
import { createClass } from '@/lib/services/classes/lifecycle'
import { enrolStudent } from '@/lib/services/enrollments'
import { backfillSessionSubjects } from '@/lib/data/class-sessions'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { setMissingClassSubject, addSubjectToStudent } from '@/lib/services/class-subjects'
import { ValidationError, PermissionError } from '@/lib/errors'

/**
 * Naming the subject of a class that has none is the ONLY repair for a gap nothing else can
 * close: a class fixes its subject at creation, sessions copy it when they are recorded, and
 * no other screen sets it. So the rules that matter here are about what it must refuse.
 */
const actor = { id: 'admin-1' } as never
const input = { classId: 'class-1', subjectId: 'sub-1' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireActorCapability).mockResolvedValue(undefined as never)
  vi.mocked(canManageClass).mockResolvedValue(true)
  vi.mocked(selectSubjectById).mockResolvedValue({ id: 'sub-1', name: 'Physics' } as never)
  vi.mocked(updateClassSubjectWhenUnset).mockResolvedValue(true)
  vi.mocked(backfillSessionSubjects).mockResolvedValue(15)
  // No other classes by default, so a subject is free unless a test says otherwise.
  vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue([])
  vi.mocked(selectActiveEnrollmentRowsForClass).mockResolvedValue([])
  vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValue([])
  vi.mocked(selectClassesByIds).mockResolvedValue([])
  vi.mocked(getProfileById).mockResolvedValue({
    id: 'stu-1',
    role: 'student',
    status: 'active',
    full_name: 'Sara Student',
  } as never)
  vi.mocked(createClass).mockResolvedValue({ id: 'new-class', name: 'Sara Student - Physics' } as never)
})

describe('setMissingClassSubject', () => {
  it('names the subject and labels the history that recorded none', async () => {
    const result = await setMissingClassSubject(actor, input)

    expect(updateClassSubjectWhenUnset).toHaveBeenCalledWith('class-1', 'sub-1')
    // The sessions are relabelled with the SAME subject the class just took, which is the
    // only value they could have taught.
    expect(backfillSessionSubjects).toHaveBeenCalledWith('class-1', 'sub-1')
    expect(result.sessionsLabelled).toBe(15)
  })

  it('REFUSES a class that already names a subject, rather than re-pointing it', async () => {
    // Re-pointing would leave past sessions describing a subject the class no longer teaches.
    // The guard lives in the query, so "already set" comes back as "no row changed".
    vi.mocked(updateClassSubjectWhenUnset).mockResolvedValue(false)

    await expect(setMissingClassSubject(actor, input)).rejects.toThrow(ValidationError)
    // Crucially the backfill must NOT run: those sessions belong to another subject.
    expect(backfillSessionSubjects).not.toHaveBeenCalled()
  })

  it('rejects an unknown subject before touching the class', async () => {
    vi.mocked(selectSubjectById).mockResolvedValue(null as never)

    await expect(setMissingClassSubject(actor, input)).rejects.toThrow(ValidationError)
    expect(updateClassSubjectWhenUnset).not.toHaveBeenCalled()
  })

  it('requires authority over THIS class, and checks it before reading or writing', async () => {
    // canManageClass, not the academy-wide manageClasses: the tutor and mentor who record
    // sessions on this class can name its missing subject, because that is the same
    // authority as recording them. Someone with no authority over it cannot.
    vi.mocked(canManageClass).mockResolvedValue(false)

    await expect(setMissingClassSubject(actor, input)).rejects.toThrow(PermissionError)
    expect(selectSubjectById).not.toHaveBeenCalled()
    expect(updateClassSubjectWhenUnset).not.toHaveBeenCalled()
    expect(backfillSessionSubjects).not.toHaveBeenCalled()
  })

  it('scopes that check to the class being repaired', async () => {
    await setMissingClassSubject(actor, input)
    expect(vi.mocked(canManageClass).mock.calls[0][1]).toBe('class-1')
  })

  it('records how much history it relabelled, so the change can be reviewed', async () => {
    await setMissingClassSubject(actor, input)

    expect(vi.mocked(auditPrivilegedAction).mock.calls[0][1]).toBe('class.setSubject')
    expect(vi.mocked(auditPrivilegedAction).mock.calls[0][4]).toMatchObject({
      subject_id: 'sub-1',
      sessions_labelled: 15,
    })
  })
})

/**
 * A class is one student and one subject, so a SECOND active class for the same pair is a data
 * error, not a variation: the student's subject tabs would show "Physics, Physics" with nothing
 * to tell them apart, and hours and attendance would split across two records of one subject.
 * Both ways a class comes to name a subject refuse it. An ARCHIVED class does not count - a
 * subject retired and later taken up again is a new class, and nothing is ambiguous about it.
 */
describe('addSubjectToStudent refuses a subject the student already takes', () => {
  const addInput = { studentId: 'stu-1', subjectId: 'sub-1' }

  it('rejects it, naming the student and the subject, and creates nothing', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c-phys'])
    vi.mocked(selectClassesByIds).mockResolvedValue([{ id: 'c-phys', subject_id: 'sub-1', status: 'active' }] as never)

    await expect(addSubjectToStudent(actor, addInput)).rejects.toThrow(/Sara Student already takes Physics/)
    expect(createClass).not.toHaveBeenCalled()
    expect(enrolStudent).not.toHaveBeenCalled()
  })

  it('allows it again once the earlier class is archived', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c-phys'])
    vi.mocked(selectClassesByIds).mockResolvedValue([
      { id: 'c-phys', subject_id: 'sub-1', status: 'archived' },
    ] as never)

    await expect(addSubjectToStudent(actor, addInput)).resolves.toBeTruthy()
    expect(createClass).toHaveBeenCalledWith(actor, 'Sara Student - Physics', 'sub-1')
  })

  it('creates the class when the student takes other subjects but not this one', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c-math'])
    vi.mocked(selectClassesByIds).mockResolvedValue([
      { id: 'c-math', subject_id: 'sub-math', status: 'active' },
    ] as never)

    await addSubjectToStudent(actor, addInput)
    expect(createClass).toHaveBeenCalledTimes(1)
    expect(enrolStudent).toHaveBeenCalledTimes(1)
  })
})

describe('setMissingClassSubject refuses a subject a student of the class already takes', () => {
  it('rejects it before naming the subject or relabelling any history', async () => {
    vi.mocked(selectActiveEnrollmentRowsForClass).mockResolvedValue([{ id: 'e1', student_id: 'stu-1' }] as never)
    vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValue([
      { student_id: 'stu-1', class_id: 'class-1' },
      { student_id: 'stu-1', class_id: 'c-phys' },
    ] as never)
    vi.mocked(selectClassesByIds).mockResolvedValue([{ id: 'c-phys', subject_id: 'sub-1', status: 'active' }] as never)

    await expect(setMissingClassSubject(actor, input)).rejects.toThrow(/already takes Physics/)
    expect(updateClassSubjectWhenUnset).not.toHaveBeenCalled()
    expect(backfillSessionSubjects).not.toHaveBeenCalled()
  })

  it('does not count the class being repaired against itself', async () => {
    vi.mocked(selectActiveEnrollmentRowsForClass).mockResolvedValue([{ id: 'e1', student_id: 'stu-1' }] as never)
    vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValue([
      { student_id: 'stu-1', class_id: 'class-1' },
    ] as never)

    await expect(setMissingClassSubject(actor, input)).resolves.toMatchObject({ sessionsLabelled: 15 })
    // With no OTHER class to compare, there is nothing to read.
    expect(selectClassesByIds).not.toHaveBeenCalled()
  })

  it('ignores an archived class of the same subject', async () => {
    vi.mocked(selectActiveEnrollmentRowsForClass).mockResolvedValue([{ id: 'e1', student_id: 'stu-1' }] as never)
    vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValue([
      { student_id: 'stu-1', class_id: 'c-old' },
    ] as never)
    vi.mocked(selectClassesByIds).mockResolvedValue([{ id: 'c-old', subject_id: 'sub-1', status: 'archived' }] as never)

    await expect(setMissingClassSubject(actor, input)).resolves.toMatchObject({ sessionsLabelled: 15 })
  })
})
