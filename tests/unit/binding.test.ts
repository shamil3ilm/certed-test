import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/profiles', () => ({
  selectProfileIdByAuthUserId: vi.fn(),
  selectAllowlistRowByEmail: vi.fn(),
  claimAllowlistRowOnOAuth: vi.fn(),
}))

import { claimAllowlistRowOnOAuth, selectAllowlistRowByEmail, selectProfileIdByAuthUserId } from '@/lib/data/profiles'
import { bindProfileOnFirstLogin } from '@/lib/auth/binding'

beforeEach(() => vi.resetAllMocks())

describe('bindProfileOnFirstLogin', () => {
  it('returns the existing profile id when already bound, without touching the allowlist', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce('p1')
    expect(await bindProfileOnFirstLogin('u1', 'a@b.com')).toEqual({ profileId: 'p1', activated: false })
    expect(selectAllowlistRowByEmail).not.toHaveBeenCalled()
  })

  it('returns null when the email is not allowlisted, and never writes', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce(null)
    expect(await bindProfileOnFirstLogin('u1', 'nope@b.com')).toBeNull()
    expect(claimAllowlistRowOnOAuth).not.toHaveBeenCalled()
  })

  it('claims AND activates an unbound pending invite, returning activated:true', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce({ id: 'p2', auth_user_id: null, role: 'tutor' } as never)
    vi.mocked(claimAllowlistRowOnOAuth).mockResolvedValueOnce('p2')
    expect(await bindProfileOnFirstLogin('u2', 'tutor@b.com')).toEqual({ profileId: 'p2', activated: true })
    expect(claimAllowlistRowOnOAuth).toHaveBeenCalledWith('p2', 'u2')
  })

  it('refuses to activate a MINOR via OAuth (no guardian consent captured)', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    // A student with no date_of_birth is treated as a minor (KG-12 default).
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce({
      id: 'kid',
      auth_user_id: null,
      role: 'student',
      date_of_birth: null,
      guardian_name: null,
    } as never)
    expect(await bindProfileOnFirstLogin('u9', 'kid@b.com')).toBeNull()
    expect(claimAllowlistRowOnOAuth).not.toHaveBeenCalled()
  })

  it('refuses to rebind a row already bound to a different user', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce({ id: 'p3', auth_user_id: 'other' } as never)
    expect(await bindProfileOnFirstLogin('u3', 'taken@b.com')).toBeNull()
    expect(claimAllowlistRowOnOAuth).not.toHaveBeenCalled()
  })

  it('is idempotent when the row is already bound to this same user', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce({ id: 'p4', auth_user_id: 'u4' } as never)
    expect(await bindProfileOnFirstLogin('u4', 'same@b.com')).toEqual({ profileId: 'p4', activated: false })
    expect(claimAllowlistRowOnOAuth).not.toHaveBeenCalled()
  })

  it('returns null when the row is not claimable (not pending, or a concurrent login won)', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce({ id: 'p5', auth_user_id: null } as never)
    // The status='pending' + auth_user_id null guard matched no row.
    vi.mocked(claimAllowlistRowOnOAuth).mockResolvedValueOnce(null)
    expect(await bindProfileOnFirstLogin('u5', 'race@b.com')).toBeNull()
  })
})
