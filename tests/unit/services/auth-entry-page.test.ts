import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadLoginPageData, loadRegisterPageData } from '@/lib/services/page-data/auth-entry-page'

beforeEach(() => vi.resetAllMocks())

describe('loadLoginPageData', () => {
  it('returns the correct redirect for an active signed-in actor', async () => {
    await expect(
      loadLoginPageData({ profile: { id: 'user-1' }, accessState: 'active' }, {}, false),
    ).resolves.toMatchObject({ redirectTo: '/dashboard' })
  })

  it('loads mock demo emails and banner flags for the logged-out login page', async () => {
    await expect(
      loadLoginPageData({ profile: null, accessState: 'unauthenticated' }, { error: '1', registered: '1' }, true),
    ).resolves.toEqual({
      redirectTo: null,
      mockMode: true,
      showRegisteredBanner: true,
      mockLoginError: true,
      demoEmails: ['admin@mock.test', 'subadmin@mock.test', 'tutor@mock.test', 'mentor@mock.test', 'student@mock.test'],
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
