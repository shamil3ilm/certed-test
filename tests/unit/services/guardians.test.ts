import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/users/admin-lifecycle', () => ({ requireManageableTarget: vi.fn() }))
vi.mock('@/lib/data/guardians', () => ({
  selectGuardiansByStudent: vi.fn(),
  insertGuardian: vi.fn(),
  deleteGuardian: vi.fn(),
  clearPrimaryForStudent: vi.fn(),
  setGuardianPrimary: vi.fn(),
}))

import { requireManageableTarget } from '@/lib/services/users/admin-lifecycle'
import { insertGuardian, deleteGuardian, clearPrimaryForStudent, setGuardianPrimary } from '@/lib/data/guardians'
import { addGuardian, removeGuardian, makeGuardianPrimary } from '@/lib/services/guardians'

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
})

describe('addGuardian', () => {
  it('re-checks the tier via requireManageableTarget', async () => {
    await addGuardian(actor, STUDENT, valid)
    expect(requireManageableTarget).toHaveBeenCalledWith(actor, STUDENT)
  })

  it('refuses to attach a guardian to a non-student target', async () => {
    vi.mocked(requireManageableTarget).mockResolvedValue({ id: 't1', role: 'tutor' } as any)
    await expect(addGuardian(actor, 't1', valid)).rejects.toThrow(/only be added to a student/i)
    expect(insertGuardian).not.toHaveBeenCalled()
  })

  it('rejects an empty name', async () => {
    await expect(addGuardian(actor, STUDENT, { ...valid, name: '' })).rejects.toThrow()
    expect(insertGuardian).not.toHaveBeenCalled()
  })

  it('rejects a malformed email', async () => {
    await expect(addGuardian(actor, STUDENT, { ...valid, email: 'not-an-email' })).rejects.toThrow()
    expect(insertGuardian).not.toHaveBeenCalled()
  })

  it('accepts an empty email and stores null', async () => {
    await addGuardian(actor, STUDENT, { ...valid, email: '', phone: '' })
    expect(insertGuardian).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: STUDENT, name: 'Asha Rao', email: null, phone: null }),
    )
  })

  it('clears the existing primary before inserting a new primary guardian', async () => {
    await addGuardian(actor, STUDENT, { ...valid, is_primary: true })
    expect(clearPrimaryForStudent).toHaveBeenCalledWith(STUDENT)
    expect(insertGuardian).toHaveBeenCalledWith(expect.objectContaining({ is_primary: true }))
  })

  it('does NOT clear the primary when adding a non-primary guardian', async () => {
    await addGuardian(actor, STUDENT, { ...valid, is_primary: false })
    expect(clearPrimaryForStudent).not.toHaveBeenCalled()
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
  it('clears the others then sets the chosen one', async () => {
    await makeGuardianPrimary(actor, STUDENT, G2)
    expect(clearPrimaryForStudent).toHaveBeenCalledWith(STUDENT)
    expect(setGuardianPrimary).toHaveBeenCalledWith(G2, STUDENT)
  })
})
