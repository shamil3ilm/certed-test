import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({
  requireAdminPersona: vi.fn(),
  loadPersonaFlags: vi.fn(async () => ({ isAdmin: true, isSubAdmin: false })),
}))
vi.mock('@/lib/services/users/directory', () => ({ getProfileById: vi.fn(), getProfileByEmail: vi.fn() }))
vi.mock('@/lib/data/profiles', () => ({ revokeProfileGuarded: vi.fn(), updateProfile: vi.fn() }))
vi.mock('@/lib/data/profile-lifecycle', () => ({
  callEraseProfile: vi.fn(),
  callRestoreProfile: vi.fn(),
  clearErasedAuthLink: vi.fn(),
}))
vi.mock('@/lib/data/auth-accounts', () => ({ deleteAuthUser: vi.fn(), setAuthUserBanned: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { getProfileById } from '@/lib/services/users/directory'
import { callEraseProfile, callRestoreProfile, clearErasedAuthLink } from '@/lib/data/profile-lifecycle'
import { deleteAuthUser } from '@/lib/data/auth-accounts'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { eraseUser, restoreUser } from '@/lib/services/users/admin-lifecycle'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * Erasure's database half - notes, guardians, the PII scrub - is one transaction that re-checks
 * under a row lock that the account is still revoked (0109). What the service still owns is the
 * sign-in in the identity provider, which no database transaction can include: it is deleted
 * after, and unlinked only once it is gone.
 */
const admin = { id: 'admin-1' } as never
const revoked = { id: 'u1', role: 'student', status: 'disabled', auth_user_id: 'auth-u1' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getProfileById).mockResolvedValue(revoked as never)
  vi.mocked(callEraseProfile).mockResolvedValue({ outcome: 'erased', authUserId: 'auth-u1' })
})

describe('eraseUser', () => {
  it('erases a revoked account, audits it, then deletes and unlinks its sign-in', async () => {
    await eraseUser(admin, 'u1')
    expect(callEraseProfile).toHaveBeenCalledWith('u1')
    expect(auditPrivilegedAction).toHaveBeenCalledWith(admin, 'user.erase', 'profile', 'u1')
    expect(deleteAuthUser).toHaveBeenCalledWith('auth-u1')
    expect(clearErasedAuthLink).toHaveBeenCalledWith('u1', 'auth-u1')
  })

  it('refuses an account that is not revoked when the write re-checks it', async () => {
    vi.mocked(callEraseProfile).mockResolvedValue({ outcome: 'not_disabled', authUserId: null })
    await expect(eraseUser(admin, 'u1')).rejects.toBeInstanceOf(ValidationError)
    expect(deleteAuthUser).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('refuses to erase your own account before writing anything', async () => {
    vi.mocked(getProfileById).mockResolvedValue({ ...revoked, id: 'admin-1' } as never)
    await expect(eraseUser(admin, 'admin-1')).rejects.toBeInstanceOf(ValidationError)
    expect(callEraseProfile).not.toHaveBeenCalled()
  })

  it('reports a profile that disappeared as not found', async () => {
    vi.mocked(callEraseProfile).mockResolvedValue({ outcome: 'not_found', authUserId: null })
    await expect(eraseUser(admin, 'u1')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('is an idempotent no-op, with no second audit, when the account is already fully erased', async () => {
    vi.mocked(callEraseProfile).mockResolvedValue({ outcome: 'already_erased', authUserId: null })
    await eraseUser(admin, 'u1')
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
    expect(deleteAuthUser).not.toHaveBeenCalled()
  })

  /**
   * Clearing the sign-in link before the sign-in is deleted would, on a failed delete, leave a
   * live login with the real email and nothing pointing at it - and erased_at would make every
   * retry a no-op. So the link stays until the sign-in is gone.
   */
  it('keeps the sign-in link when its delete fails, and says to erase again', async () => {
    vi.mocked(deleteAuthUser).mockRejectedValue(new Error('gotrue down'))
    await expect(eraseUser(admin, 'u1')).rejects.toThrow(/Erase it again/)
    expect(clearErasedAuthLink).not.toHaveBeenCalled()
    // The PII is already gone, so the erasure itself is on the record.
    expect(auditPrivilegedAction).toHaveBeenCalledWith(admin, 'user.erase', 'profile', 'u1')
  })

  it('erasing again finishes a sign-in left behind, without auditing the erasure twice', async () => {
    vi.mocked(callEraseProfile).mockResolvedValue({ outcome: 'already_erased', authUserId: 'auth-u1' })
    await eraseUser(admin, 'u1')
    expect(deleteAuthUser).toHaveBeenCalledWith('auth-u1')
    expect(clearErasedAuthLink).toHaveBeenCalledWith('u1', 'auth-u1')
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })
})

describe('restoreUser refuses an erased account', () => {
  it('throws instead of resurrecting a nameless, un-loginable account', async () => {
    vi.mocked(callRestoreProfile).mockResolvedValue('erased')
    await expect(restoreUser(admin, 'u1')).rejects.toBeInstanceOf(ValidationError)
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })
})
