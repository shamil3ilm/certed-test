import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { writeAudit } from '@/lib/repos/audit'
import { ERROR_CODES } from '@/lib/api/error-codes'
import { createAdminClient } from '@/lib/supabase/admin'
import { loginMockPasswordUser } from '@/lib/services/mock-auth'

beforeEach(() => vi.resetAllMocks())

function adminForFirstLogin(profile: { id: string; auth_user_id: string | null; password: string | null }) {
  const updateBuilder = {
    update: vi.fn(() => updateBuilder),
    eq: vi.fn(async () => ({ data: null, error: null })),
  }
  const selectBuilder = {
    select: vi.fn(() => selectBuilder),
    eq: vi.fn(() => selectBuilder),
    maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
  }
  return {
    from: vi
      .fn()
      .mockReturnValueOnce(selectBuilder)
      .mockReturnValueOnce(updateBuilder),
  }
}

describe('loginMockPasswordUser', () => {
  it('fails and audits when credentials are missing', async () => {
    await expect(loginMockPasswordUser('', '')).resolves.toEqual({
      ok: false,
      code: ERROR_CODES.invalidInput,
    })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: null,
      action: 'auth.login_failure',
      entity_type: 'profile',
      entity_id: null,
    })
  })

  it('fails and audits when the profile is not found', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(loginMockPasswordUser('missing@mock.test', 'cert-ed')).resolves.toEqual({
      ok: false,
      code: ERROR_CODES.unauthorized,
    })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: null,
      action: 'auth.login_failure',
      entity_type: 'profile',
      entity_id: null,
    })
  })

  it('fails and audits against the profile when the password is wrong', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({
        data: { id: 'profile-1', auth_user_id: 'mock:profile-1', password: null },
        error: null,
      }) as any,
    )
    await expect(loginMockPasswordUser('student@mock.test', 'wrong-password')).resolves.toEqual({
      ok: false,
      code: ERROR_CODES.unauthorized,
    })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'profile-1',
      action: 'auth.login_failure',
      entity_type: 'profile',
      entity_id: 'profile-1',
    })
  })

  it('binds an unclaimed profile on first successful login', async () => {
    const admin = adminForFirstLogin({ id: 'profile-1', auth_user_id: null, password: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(admin as any)

    await expect(loginMockPasswordUser('student@mock.test', 'cert-ed', 'cert-ed')).resolves.toEqual({
      ok: true,
      uid: 'mock:profile-1',
    })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'profile-1',
      action: 'auth.login_success',
      entity_type: 'profile',
      entity_id: 'profile-1',
    })
  })

  it('uses a user-specific password before the shared dev password', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({
        data: { id: 'profile-1', auth_user_id: 'mock:profile-1', password: 'own-secret' },
        error: null,
      }) as any,
    )
    await expect(loginMockPasswordUser('student@mock.test', 'cert-ed', 'cert-ed')).resolves.toEqual({
      ok: false,
      code: ERROR_CODES.unauthorized,
    })

    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({
        data: { id: 'profile-1', auth_user_id: 'mock:profile-1', password: 'own-secret' },
        error: null,
      }) as any,
    )
    await expect(loginMockPasswordUser('student@mock.test', 'own-secret', 'cert-ed')).resolves.toEqual({
      ok: true,
      uid: 'mock:profile-1',
    })
  })
})
