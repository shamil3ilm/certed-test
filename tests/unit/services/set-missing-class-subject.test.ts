import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/data/subjects', () => ({ selectSubjectById: vi.fn() }))
vi.mock('@/lib/data/class-subjects', () => ({
  callCreateStudentSubjectClass: vi.fn(),
  callSetClassSubjectWhenUnset: vi.fn(),
}))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/classes/lifecycle', () => ({ archiveClass: vi.fn() }))
vi.mock('@/lib/services/class-tutors', () => ({ addTutor: vi.fn() }))

import { requireActorCapability } from '@/lib/services/authorization'
import { canManageClass } from '@/lib/permission'
import { selectSubjectById } from '@/lib/data/subjects'
import { callCreateStudentSubjectClass, callSetClassSubjectWhenUnset } from '@/lib/data/class-subjects'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { getProfileById } from '@/lib/services/users'
import { archiveClass } from '@/lib/services/classes/lifecycle'
import { addTutor } from '@/lib/services/class-tutors'
import { setMissingClassSubject, addSubjectToStudent } from '@/lib/services/class-subjects'
import { ValidationError, PermissionError } from '@/lib/errors'

/**
 * Both ways a class comes to name a subject are single Postgres transactions (0107). What stays
 * in the service is authorization, validation of its inputs, the audit written after commit,
 * and the tutor step - which carries its own persona logic and a compensating archive. So these
 * tests pin the ORDER (nothing is written before authority is proven) and the refusals.
 */
const actor = { id: 'admin-1' } as never
const input = { classId: 'class-1', subjectId: 'sub-1' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireActorCapability).mockResolvedValue(undefined as never)
  vi.mocked(canManageClass).mockResolvedValue(true)
  vi.mocked(selectSubjectById).mockResolvedValue({ id: 'sub-1', name: 'Physics' } as never)
  vi.mocked(callSetClassSubjectWhenUnset).mockResolvedValue({ ok: true, sessionsLabelled: 15 })
  vi.mocked(getProfileById).mockResolvedValue({
    id: 'stu-1',
    role: 'student',
    status: 'active',
    full_name: 'Sara Student',
  } as never)
  vi.mocked(callCreateStudentSubjectClass).mockResolvedValue({
    ok: true,
    class: { id: 'new-class', name: 'Sara Student - Physics', status: 'active', subject_id: 'sub-1' } as never,
  })
})

describe('setMissingClassSubject', () => {
  it('names the subject and labels the history, in one call', async () => {
    const result = await setMissingClassSubject(actor, input)

    expect(callSetClassSubjectWhenUnset).toHaveBeenCalledWith('class-1', 'sub-1')
    expect(result.sessionsLabelled).toBe(15)
  })

  it('REFUSES a class that already names a subject, rather than re-pointing it', async () => {
    vi.mocked(callSetClassSubjectWhenUnset).mockResolvedValue({ ok: false, reason: 'subject_already_set' })

    await expect(setMissingClassSubject(actor, input)).rejects.toThrow(ValidationError)
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('REFUSES a subject a student of the class already takes in another class', async () => {
    vi.mocked(callSetClassSubjectWhenUnset).mockResolvedValue({ ok: false, reason: 'subject_already_taken' })

    await expect(setMissingClassSubject(actor, input)).rejects.toThrow(/already takes Physics/)
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('rejects an unknown subject before touching the class', async () => {
    vi.mocked(selectSubjectById).mockResolvedValue(null as never)

    await expect(setMissingClassSubject(actor, input)).rejects.toThrow(ValidationError)
    expect(callSetClassSubjectWhenUnset).not.toHaveBeenCalled()
  })

  it('requires authority over THIS class, and checks it before reading or writing', async () => {
    // canManageClass, not the academy-wide manageClasses: the tutor and mentor who record
    // sessions on this class can name its missing subject, because that is the same
    // authority as recording them. Someone with no authority over it cannot.
    vi.mocked(canManageClass).mockResolvedValue(false)

    await expect(setMissingClassSubject(actor, input)).rejects.toThrow(PermissionError)
    expect(selectSubjectById).not.toHaveBeenCalled()
    expect(callSetClassSubjectWhenUnset).not.toHaveBeenCalled()
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

describe('addSubjectToStudent', () => {
  const addInput = { studentId: 'stu-1', subjectId: 'sub-1' }

  it('creates the class and enrols the student in ONE atomic call, then audits both', async () => {
    const created = await addSubjectToStudent(actor, addInput)

    expect(callCreateStudentSubjectClass).toHaveBeenCalledWith('stu-1', 'sub-1', 'Sara Student - Physics')
    expect(created.id).toBe('new-class')
    const actions = vi.mocked(auditPrivilegedAction).mock.calls.map((c) => c[1])
    expect(actions).toEqual(['class.create', 'class.enroll'])
  })

  it('refuses a subject the student already takes, and records nothing', async () => {
    vi.mocked(callCreateStudentSubjectClass).mockResolvedValue({ ok: false, reason: 'subject_already_taken' })

    await expect(addSubjectToStudent(actor, addInput)).rejects.toThrow(/Sara Student already takes Physics/)
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
    expect(addTutor).not.toHaveBeenCalled()
  })

  it('refuses a student revoked between the check and the write', async () => {
    vi.mocked(callCreateStudentSubjectClass).mockResolvedValue({ ok: false, reason: 'student_not_eligible' })

    await expect(addSubjectToStudent(actor, addInput)).rejects.toThrow(ValidationError)
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('assigns the tutor once the class exists', async () => {
    await addSubjectToStudent(actor, { ...addInput, tutorId: 't-1' })
    expect(addTutor).toHaveBeenCalledWith(actor, { classId: 'new-class', tutorId: 't-1' })
  })

  it('archives the new class when the tutor step fails, and surfaces the original error', async () => {
    vi.mocked(addTutor).mockRejectedValue(new Error('tutor inactive'))

    await expect(addSubjectToStudent(actor, { ...addInput, tutorId: 't-1' })).rejects.toThrow(/tutor inactive/)
    expect(archiveClass).toHaveBeenCalledWith(actor, 'new-class')
  })

  it('requires manageClasses before reading or writing anything', async () => {
    vi.mocked(requireActorCapability).mockRejectedValue(new PermissionError('no'))

    await expect(addSubjectToStudent(actor, addInput)).rejects.toThrow(PermissionError)
    expect(getProfileById).not.toHaveBeenCalled()
    expect(callCreateStudentSubjectClass).not.toHaveBeenCalled()
  })

  it('rejects a revoked student before creating anything', async () => {
    vi.mocked(getProfileById).mockResolvedValue({ id: 'stu-1', role: 'student', status: 'disabled' } as never)

    await expect(addSubjectToStudent(actor, addInput)).rejects.toThrow(ValidationError)
    expect(callCreateStudentSubjectClass).not.toHaveBeenCalled()
  })
})
