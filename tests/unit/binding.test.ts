import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/profiles', () => ({
  selectProfileIdByAuthUserId: vi.fn(),
  selectAllowlistRowByEmail: vi.fn(),
  bindAuthUserIdIfUnbound: vi.fn(),
}))

import {
  bindAuthUserIdIfUnbound,
  selectAllowlistRowByEmail,
  selectProfileIdByAuthUserId,
} from '@/lib/data/profiles'
import { bindProfileOnFirstLogin } from '@/lib/auth/binding'

beforeEach(() => vi.resetAllMocks())

describe('bindProfileOnFirstLogin', () => {
  it('returns the existing profile id when already bound, without touching the allowlist', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce('p1')
    expect(await bindProfileOnFirstLogin('u1', 'a@b.com')).toBe('p1')
    expect(selectAllowlistRowByEmail).not.toHaveBeenCalled()
  })

  it('returns null when the email is not allowlisted, and never writes', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce(null)
    expect(await bindProfileOnFirstLogin('u1', 'nope@b.com')).toBeNull()
    expect(bindAuthUserIdIfUnbound).not.toHaveBeenCalled()
  })

  it('binds an unbound allowlist row and returns its id', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce({ id: 'p2', auth_user_id: null })
    vi.mocked(bindAuthUserIdIfUnbound).mockResolvedValueOnce('p2')
    expect(await bindProfileOnFirstLogin('u2', 'tutor@b.com')).toBe('p2')
    expect(bindAuthUserIdIfUnbound).toHaveBeenCalledWith('p2', 'u2')
  })

  it('refuses to rebind a row already bound to a different user', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce({ id: 'p3', auth_user_id: 'other' })
    expect(await bindProfileOnFirstLogin('u3', 'taken@b.com')).toBeNull()
    expect(bindAuthUserIdIfUnbound).not.toHaveBeenCalled()
  })

  it('is idempotent when the row is already bound to this same user', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce({ id: 'p4', auth_user_id: 'u4' })
    expect(await bindProfileOnFirstLogin('u4', 'same@b.com')).toBe('p4')
    expect(bindAuthUserIdIfUnbound).not.toHaveBeenCalled()
  })

  it('returns null when a concurrent login claimed the row first', async () => {
    vi.mocked(selectProfileIdByAuthUserId).mockResolvedValueOnce(null)
    vi.mocked(selectAllowlistRowByEmail).mockResolvedValueOnce({ id: 'p5', auth_user_id: null })
    // The `is('auth_user_id', null)` guard matched no row for the loser.
    vi.mocked(bindAuthUserIdIfUnbound).mockResolvedValueOnce(null)
    expect(await bindProfileOnFirstLogin('u5', 'race@b.com')).toBeNull()
  })
})
