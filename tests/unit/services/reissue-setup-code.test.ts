import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn(), requireAdminPersona: vi.fn() }))
vi.mock('@/lib/data/profiles-auth', () => ({ reissueSetupCodeForUnclaimed: vi.fn() }))
vi.mock('@/lib/services/users/directory', () => ({ getProfileById: vi.fn(), getProfileByEmail: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { reissueSetupCode } from '@/lib/services/users/admin-lifecycle'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { reissueSetupCodeForUnclaimed } from '@/lib/data/profiles-auth'
import { getProfileById } from '@/lib/services/users/directory'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError } from '@/lib/errors'

/**
 * A setup code is ISSUED, never read back (ADR-0008): only its hash is stored, so a lost code is
 * REPLACED. The two things that must hold are that the plaintext never reaches the write, and
 * that re-issue carries exactly the tier gate addUser already applies - no new capability.
 */
const actor = { id: 'actor-1' } as never
const target = (over = {}) =>
  ({
    id: 'p1',
    email: 'x@y.test',
    full_name: 'X',
    role: 'student',
    status: 'pending',
    auth_user_id: null,
    ...over,
  }) as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true, isSubAdmin: false } as never)
  vi.mocked(getProfileById).mockResolvedValue(target())
  vi.mocked(reissueSetupCodeForUnclaimed).mockResolvedValue(true)
})

describe('reissueSetupCode', () => {
  it('returns a fresh 8-character code and its expiry', async () => {
    const result = await reissueSetupCode(actor, 'p1')
    expect(result.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now())
    expect(result.profile.email).toBe('x@y.test')
  })

  // The stored value is the HASH. If the plaintext ever reached the write, the whole reason
  // ADR-0008 exists would be gone, so assert the shape that proves it did not.
  it('stores a hash, never the code it returns', async () => {
    const { code } = await reissueSetupCode(actor, 'p1')
    const [, hash] = vi.mocked(reissueSetupCodeForUnclaimed).mock.calls[0]
    expect(hash).not.toBe(code)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses an actor who may not manage that role', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false, isSubAdmin: true } as never)
    vi.mocked(getProfileById).mockResolvedValue(target({ role: 'admin' }))
    await expect(reissueSetupCode(actor, 'p1')).rejects.toThrow(PermissionError)
    expect(reissueSetupCodeForUnclaimed).not.toHaveBeenCalled()
  })

  it('refuses a claimed or revoked account, and audits nothing', async () => {
    vi.mocked(reissueSetupCodeForUnclaimed).mockResolvedValue(false)
    await expect(reissueSetupCode(actor, 'p1')).rejects.toThrow(ValidationError)
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('writes one user.reissue_code audit row on success', async () => {
    await reissueSetupCode(actor, 'p1')
    expect(auditPrivilegedAction).toHaveBeenCalledWith(actor, 'user.reissue_code', 'profile', 'p1')
  })
})
