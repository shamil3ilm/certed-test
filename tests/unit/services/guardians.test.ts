import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/users/admin-lifecycle', () => ({ requireManageableTarget: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/data/guardians', () => ({
  selectGuardiansByStudent: vi.fn(),
  callAddGuardian: vi.fn(),
  deleteGuardian: vi.fn(),
  callMakeGuardianPrimary: vi.fn(),
}))

import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { requireManageableTarget } from '@/lib/services/users/admin-lifecycle'
import { callAddGuardian, deleteGuardian, callMakeGuardianPrimary } from '@/lib/data/guardians'
import { addGuardian, removeGuardian, makeGuardianPrimary } from '@/lib/services/guardians'
import { NotFoundError } from '@/lib/errors'

const actor = { id: 'admin-1' } as any
const STUDENT = 's1'
const valid = {
  name: 'Asha Rao',
  phone: '+91 90000 00000',
  email: 'asha@x.com',
  relationship: 'Mother',
  is_primary: false,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireManageableTarget).mockResolvedValue({ id: STUDENT, role: 'student' } as any)
  vi.mocked(callAddGuardian).mockResolvedValue('g-new')
})

describe('addGuardian', () => {
  it('re-checks the tier via requireManageableTarget', async () => {
    await addGuardian(actor, STUDENT, valid)
    expect(requireManageableTarget).toHaveBeenCalledWith(actor, STUDENT)
  })

  it('refuses to attach a guardian to a non-student target', async () => {
    vi.mocked(requireManageableTarget).mockResolvedValue({ id: 't1', role: 'tutor' } as any)
    await expect(addGuardian(actor, 't1', valid)).rejects.toThrow(/only be added to a student/i)
    expect(callAddGuardian).not.toHaveBeenCalled()
  })

  it('rejects an empty name', async () => {
    await expect(addGuardian(actor, STUDENT, { ...valid, name: '' })).rejects.toThrow()
    expect(callAddGuardian).not.toHaveBeenCalled()
  })

  it('rejects a malformed email', async () => {
    await expect(addGuardian(actor, STUDENT, { ...valid, email: 'not-an-email' })).rejects.toThrow()
    expect(callAddGuardian).not.toHaveBeenCalled()
  })

  it('accepts an empty email and stores null', async () => {
    await addGuardian(actor, STUDENT, { ...valid, email: '', phone: '' })
    expect(callAddGuardian).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: STUDENT, name: 'Asha Rao', email: null, phone: null }),
    )
  })

  it('adds a primary guardian in ONE write, which moves the flag off any other', async () => {
    // As two calls, clearing the old primary and inserting the new one would leave a student with
    // no primary when the insert failed, and with two when two requests interleaved.
    await addGuardian(actor, STUDENT, { ...valid, is_primary: true })
    expect(callAddGuardian).toHaveBeenCalledTimes(1)
    expect(callAddGuardian).toHaveBeenCalledWith(expect.objectContaining({ is_primary: true }))
  })
})

const G1 = '11111111-1111-4111-8111-111111111111'
const G2 = '22222222-2222-4222-8222-222222222222'

describe('removeGuardian', () => {
  it('checks the tier then deletes scoped to the student', async () => {
    await removeGuardian(actor, STUDENT, G1)
    expect(requireManageableTarget).toHaveBeenCalledWith(actor, STUDENT)
    expect(deleteGuardian).toHaveBeenCalledWith(G1, STUDENT)
  })

  it('rejects a malformed guardian id before any DB write', async () => {
    await expect(removeGuardian(actor, STUDENT, 'not-a-uuid')).rejects.toThrow(/Invalid guardian id/i)
    expect(deleteGuardian).not.toHaveBeenCalled()
  })
})

describe('makeGuardianPrimary', () => {
  it('moves the primary flag to the chosen guardian in one write, scoped to the student', async () => {
    await makeGuardianPrimary(actor, STUDENT, G2)
    expect(callMakeGuardianPrimary).toHaveBeenCalledWith(G2, STUDENT)
  })

  it('does not audit a guardian that is not this student’s', async () => {
    vi.mocked(callMakeGuardianPrimary).mockRejectedValueOnce(new NotFoundError('Guardian not found.'))
    await expect(makeGuardianPrimary(actor, STUDENT, G2)).rejects.toBeInstanceOf(NotFoundError)
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })
})

/**
 * Guardian rows are a minor's contact PII and were the one privileged surface
 * with no audit trail at all - every comparable service (mentee notes, user
 * lifecycle, enrolments) records who changed what.
 */
describe('guardian changes are audited', () => {
  it('records guardian.add against the new guardian, carrying the student', async () => {
    await addGuardian(actor, STUDENT, valid)
    expect(auditPrivilegedAction).toHaveBeenCalledWith(actor, 'guardian.add', 'guardian', 'g-new', {
      student_id: STUDENT,
    })
  })

  it('records guardian.remove', async () => {
    await removeGuardian(actor, STUDENT, G1)
    expect(auditPrivilegedAction).toHaveBeenCalledWith(actor, 'guardian.remove', 'guardian', G1, {
      student_id: STUDENT,
    })
  })

  it('records guardian.make_primary', async () => {
    await makeGuardianPrimary(actor, STUDENT, G2)
    expect(auditPrivilegedAction).toHaveBeenCalledWith(actor, 'guardian.make_primary', 'guardian', G2, {
      student_id: STUDENT,
    })
  })

  it('never copies the guardian contact PII into the audit record', async () => {
    await addGuardian(actor, STUDENT, valid)
    const metadata = vi.mocked(auditPrivilegedAction).mock.calls[0][4]
    expect(JSON.stringify(metadata)).not.toContain(valid.email)
    expect(JSON.stringify(metadata)).not.toContain(valid.phone)
    expect(JSON.stringify(metadata)).not.toContain(valid.name)
  })

  it('does not audit when the tier check refuses the target', async () => {
    vi.mocked(requireManageableTarget).mockRejectedValueOnce(new Error('nope'))
    await expect(removeGuardian(actor, STUDENT, G1)).rejects.toThrow()
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })
})
