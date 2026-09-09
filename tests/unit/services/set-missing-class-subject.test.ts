import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/data/subjects', () => ({ selectSubjectById: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({ updateClassSubjectWhenUnset: vi.fn() }))
vi.mock('@/lib/data/class-sessions', () => ({ backfillSessionSubjects: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/classes/lifecycle', () => ({ createClass: vi.fn(), archiveClass: vi.fn() }))
vi.mock('@/lib/services/enrollments', () => ({ enrolStudent: vi.fn() }))
vi.mock('@/lib/services/class-tutors', () => ({ addTutor: vi.fn() }))

import { requireActorCapability } from '@/lib/services/authorization'
import { selectSubjectById } from '@/lib/data/subjects'
import { updateClassSubjectWhenUnset } from '@/lib/data/classes'
import { backfillSessionSubjects } from '@/lib/data/class-sessions'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { setMissingClassSubject } from '@/lib/services/class-subjects'
import { ValidationError } from '@/lib/errors'

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
  vi.mocked(selectSubjectById).mockResolvedValue({ id: 'sub-1', name: 'Physics' } as never)
  vi.mocked(updateClassSubjectWhenUnset).mockResolvedValue(true)
  vi.mocked(backfillSessionSubjects).mockResolvedValue(15)
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

  it('requires manageClasses before reading or writing anything', async () => {
    vi.mocked(requireActorCapability).mockRejectedValue(new Error('nope'))

    await expect(setMissingClassSubject(actor, input)).rejects.toThrow('nope')
    expect(selectSubjectById).not.toHaveBeenCalled()
    expect(updateClassSubjectWhenUnset).not.toHaveBeenCalled()
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
