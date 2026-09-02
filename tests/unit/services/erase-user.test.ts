import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({
  requireAdminPersona: vi.fn(),
  loadPersonaFlags: vi.fn(async () => ({ isAdmin: true, isSubAdmin: false })),
}))
vi.mock('@/lib/services/users/directory', () => ({ getProfileById: vi.fn(), getProfileByEmail: vi.fn() }))
vi.mock('@/lib/data/profiles', () => ({
  anonymizeProfileForErasure: vi.fn(),
  selectProfileErasedAt: vi.fn(async () => null),
  updateProfile: vi.fn(),
  selectProfileRole: vi.fn(),
}))
vi.mock('@/lib/data/mentee-notes', () => ({ deleteMenteeNotesForStudent: vi.fn() }))
vi.mock('@/lib/data/guardians', () => ({ deleteGuardiansForStudent: vi.fn() }))
vi.mock('@/lib/data/auth-accounts', () => ({ deleteAuthUser: vi.fn(), setAuthUserBanned: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { getProfileById } from '@/lib/services/users/directory'
import { anonymizeProfileForErasure, selectProfileErasedAt } from '@/lib/data/profiles'
import { deleteMenteeNotesForStudent } from '@/lib/data/mentee-notes'
import { deleteGuardiansForStudent } from '@/lib/data/guardians'
import { deleteAuthUser } from '@/lib/data/auth-accounts'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { eraseUser, restoreUser } from '@/lib/services/users/admin-lifecycle'
import { ValidationError } from '@/lib/errors'

const admin = { id: 'admin-1' } as never
const revoked = { id: 'u1', role: 'student', status: 'disabled', auth_user_id: 'auth-u1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(selectProfileErasedAt).mockResolvedValue(null)
})

describe('eraseUser (N-04)', () => {
  it('erases a revoked account: deletes notes + auth, anonymises, and audits', async () => {
    vi.mocked(getProfileById).mockResolvedValue(revoked as never)
    await eraseUser(admin, 'u1')
    expect(deleteMenteeNotesForStudent).toHaveBeenCalledWith('u1')
    expect(deleteGuardiansForStudent).toHaveBeenCalledWith('u1')
    expect(deleteAuthUser).toHaveBeenCalledWith('auth-u1')
    expect(anonymizeProfileForErasure).toHaveBeenCalledWith('u1')
    expect(auditPrivilegedAction).toHaveBeenCalledWith(admin, 'user.erase', 'profile', 'u1')
  })

  it('refuses to erase an account that is not revoked', async () => {
    vi.mocked(getProfileById).mockResolvedValue({ ...revoked, status: 'active' } as never)
    await expect(eraseUser(admin, 'u1')).rejects.toBeInstanceOf(ValidationError)
    expect(anonymizeProfileForErasure).not.toHaveBeenCalled()
    expect(deleteAuthUser).not.toHaveBeenCalled()
  })

  it('refuses to erase your own account', async () => {
    vi.mocked(getProfileById).mockResolvedValue({ ...revoked, id: 'admin-1' } as never)
    await expect(eraseUser(admin, 'admin-1')).rejects.toBeInstanceOf(ValidationError)
    expect(anonymizeProfileForErasure).not.toHaveBeenCalled()
  })

  it('is an idempotent no-op when the account is already erased', async () => {
    vi.mocked(getProfileById).mockResolvedValue(revoked as never)
    vi.mocked(selectProfileErasedAt).mockResolvedValue('2026-09-01T00:00:00.000Z')
    await eraseUser(admin, 'u1')
    expect(anonymizeProfileForErasure).not.toHaveBeenCalled()
    expect(deleteMenteeNotesForStudent).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('still anonymises when the auth-user delete fails (best-effort; access already blocked)', async () => {
    vi.mocked(getProfileById).mockResolvedValue(revoked as never)
    vi.mocked(deleteAuthUser).mockRejectedValue(new Error('gotrue down'))
    await eraseUser(admin, 'u1')
    expect(anonymizeProfileForErasure).toHaveBeenCalledWith('u1')
    expect(auditPrivilegedAction).toHaveBeenCalledWith(admin, 'user.erase', 'profile', 'u1')
  })
})

describe('restoreUser refuses an erased account (N-04)', () => {
  it('throws instead of resurrecting a nameless, un-loginable account', async () => {
    vi.mocked(getProfileById).mockResolvedValue({ ...revoked } as never)
    vi.mocked(selectProfileErasedAt).mockResolvedValue('2026-09-01T00:00:00.000Z')
    await expect(restoreUser(admin, 'u1')).rejects.toBeInstanceOf(ValidationError)
  })
})
