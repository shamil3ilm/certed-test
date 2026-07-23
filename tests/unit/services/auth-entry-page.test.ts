import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/users', () => ({ listProfiles: vi.fn() }))

import { loadLoginPageData, loadRegisterPageData } from '@/lib/services/page-data/auth-entry-page'
import { listProfiles } from '@/lib/services/users'

beforeEach(() => vi.resetAllMocks())

describe('loadLoginPageData', () => {
  it('returns the correct redirect for an active signed-in actor', async () => {
    await expect(
      loadLoginPageData({ profile: { id: 'user-1' }, accessState: 'active' }, {}, false),
    ).resolves.toMatchObject({ redirectTo: '/dashboard' })
    expect(listProfiles).not.toHaveBeenCalled()
  })

  it('loads mock demo emails and banner flags for the logged-out login page', async () => {
    vi.mocked(listProfiles).mockResolvedValueOnce([
      { email: 'a@example.com' },
      { email: 'b@example.com' },
      { email: 'c@example.com' },
      { email: 'd@example.com' },
      { email: 'e@example.com' },
      { email: 'f@example.com' },
    ] as any)

    await expect(
      loadLoginPageData({ profile: null, accessState: 'unauthenticated' }, { error: '1', registered: '1' }, true),
    ).resolves.toEqual({
      redirectTo: null,
      mockMode: true,
      showRegisteredBanner: true,
      mockLoginError: true,
      demoEmails: ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com', 'e@example.com'],
    })
  })
})

describe('loadRegisterPageData', () => {
  it('redirects mock mode to login', () => {
    expect(loadRegisterPageData({ profile: null, accessState: 'unauthenticated' }, true)).toEqual({
      redirectTo: '/login',
    })
  })

  it('redirects a disabled actor away from register', () => {
    expect(loadRegisterPageData({ profile: { id: 'user-1' }, accessState: 'disabled' }, false)).toEqual({
      redirectTo: '/access-revoked',
    })
  })
})
