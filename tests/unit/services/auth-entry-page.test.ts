import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadLoginPageData, loadRegisterPageData } from '@/lib/services/page-data/auth-entry-page'

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('loadLoginPageData', () => {
  it('returns the correct redirect for an active signed-in actor', async () => {
    await expect(
      loadLoginPageData({ profile: { id: 'user-1' }, accessState: 'active' }, {}, false),
    ).resolves.toMatchObject({ redirectTo: '/dashboard' })
  })

  it('loads mock demo emails and banner flags for the logged-out login page', async () => {
    // The demo emails are gated on the BUILD-TIME NEXT_PUBLIC_MOCK_MODE literal (so they
    // tree-shake out of a production bundle), as well as the runtime mockMode. Set both.
    vi.stubEnv('NEXT_PUBLIC_MOCK_MODE', '1')
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
