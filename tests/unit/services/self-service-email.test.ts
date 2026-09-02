import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/mock/env', () => ({ isMock: () => false }))
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: () => ({ ok: true }) }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/data/profiles', () => ({ updateProfile: vi.fn(), updateOwnProfile: vi.fn() }))
vi.mock('@/lib/data/auth-accounts', () => ({
  verifyOwnPassword: vi.fn(),
  updateAuthUserEmail: vi.fn(),
  updateOwnAuthPassword: vi.fn(),
  signOutOwnOtherSessions: vi.fn(),
}))
vi.mock('@/lib/services/users/directory', () => ({ getProfileByEmail: vi.fn() }))

import { changeOwnEmail } from '@/lib/services/users/self-service'
import { verifyOwnPassword, updateAuthUserEmail } from '@/lib/data/auth-accounts'
import { updateProfile } from '@/lib/data/profiles'
import { getProfileByEmail } from '@/lib/services/users/directory'
import { ValidationError } from '@/lib/errors'

const actor = { id: 'u1', auth_user_id: 'auth-1', email: 'old@x.test' }

beforeEach(() => vi.resetAllMocks())

describe('changeOwnEmail re-authentication', () => {
  it('rejects the change when the current password is wrong, without touching auth or profile', async () => {
    vi.mocked(verifyOwnPassword).mockResolvedValue(false)
    await expect(changeOwnEmail(actor, 'new@x.test', 'wrong-pw')).rejects.toBeInstanceOf(ValidationError)
    expect(verifyOwnPassword).toHaveBeenCalledWith('old@x.test', 'wrong-pw')
    expect(updateAuthUserEmail).not.toHaveBeenCalled()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('proceeds when the current password is correct', async () => {
    vi.mocked(verifyOwnPassword).mockResolvedValue(true)
    vi.mocked(getProfileByEmail).mockResolvedValue(null as never)
    await changeOwnEmail(actor, 'new@x.test', 'right-pw')
    expect(updateAuthUserEmail).toHaveBeenCalledWith('auth-1', 'new@x.test')
    expect(updateProfile).toHaveBeenCalledWith('u1', { email: 'new@x.test' })
  })

  it('does not even verify when the email is unchanged (no-op)', async () => {
    vi.mocked(verifyOwnPassword).mockResolvedValue(true)
    // Same email (case/space-insensitive) short-circuits before any write - but AFTER the
    // password check, which still runs. The write path must not fire.
    await changeOwnEmail(actor, ' OLD@x.test ', 'right-pw')
    expect(updateAuthUserEmail).not.toHaveBeenCalled()
    expect(updateProfile).not.toHaveBeenCalled()
  })
})
