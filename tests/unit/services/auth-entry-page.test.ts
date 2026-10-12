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
      signInMessage: 'That sign-in did not complete. Please try again.',
      demoEmails: ['admin@mock.test', 'subadmin@mock.test', 'tutor@mock.test', 'mentor@mock.test', 'student@mock.test'],
    })
  })
})

/**
 * Outside mock mode the page rendered NOTHING for `?error=`, so a Google sign-in the callback
 * refused looked like a login page that had forgotten the attempt. Each reason the callback can
 * redirect with has to arrive as something a person can read.
 */
describe('loadLoginPageData - what a refused sign-in is told', () => {
  const loggedOut = { profile: null, accessState: 'unauthenticated' } as const
  const messageFor = async (error?: string) =>
    (await loadLoginPageData(loggedOut, error ? { error } : {}, false)).signInMessage

  it('names the route that WORKS for a student refused by Google', async () => {
    const message = await messageFor('needs-setup-code')
    expect(message).toMatch(/setup code/i)
    expect(message).toMatch(/parent or guardian/i)
  })

  it('tells an unlisted account to ask an administrator', async () => {
    expect(await messageFor('not-invited')).toMatch(/not on the academy's list/i)
  })

  it('stays generic for a plain sign-in failure', async () => {
    expect(await messageFor('signin')).toBe('That sign-in did not complete. Please try again.')
  })

  it('falls back to the generic message for an unrecognised value rather than showing nothing', async () => {
    expect(await messageFor('something-we-never-set')).toBe('That sign-in did not complete. Please try again.')
  })

  it('says nothing when no error was passed', async () => {
    expect(await messageFor()).toBeNull()
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
