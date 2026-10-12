import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/binding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/binding')>()
  // isBound stays REAL: the branch under test is the one that reads a refusal correctly.
  return { ...actual, bindProfileOnFirstLogin: vi.fn() }
})
vi.mock('@/lib/services/consents', () => ({ recordConsentAcceptance: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ notifyAccountActivated: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { bindProfileOnFirstLogin } from '@/lib/auth/binding'
import { recordConsentAcceptance } from '@/lib/services/consents'
import { notifyAccountActivated } from '@/lib/services/users'
import { GET } from '@/app/(prt)/auth/callback/route'

const signOut = vi.fn()

function clientWithUser(email: string | null = 'kid@example.com') {
  return {
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        data: { user: email ? { id: 'auth-1', email } : null },
        error: null,
      })),
      signOut,
    },
  }
}

const call = (query = '?code=abc') => GET(new Request(`https://app.example.com/auth/callback${query}`))
const locationOf = (res: Response) =>
  new URL(res.headers.get('location') ?? '').pathname + new URL(res.headers.get('location') ?? '').search

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(createClient).mockResolvedValue(clientWithUser() as never)
})

/**
 * A refused first login used to fall through to `next`, leaving the person signed in to a
 * session bound to no profile - every guard could then only bounce them, with nothing on
 * screen to say why. These tests pin both halves of the fix: the session is ended, and the
 * reason reaches the login page.
 */
describe('GET /auth/callback - a refused first login', () => {
  it('sends a student to the setup-code message, and does NOT leave them signed in', async () => {
    vi.mocked(bindProfileOnFirstLogin).mockResolvedValue({ refused: 'guardian_consent_required' })

    const res = await call()

    expect(locationOf(res)).toBe('/login?error=needs-setup-code')
    expect(signOut).toHaveBeenCalled()
  })

  it('tells someone who was never added that they are not on the list', async () => {
    vi.mocked(bindProfileOnFirstLogin).mockResolvedValue({ refused: 'not_invited' })

    expect(locationOf(await call())).toBe('/login?error=not-invited')
    expect(signOut).toHaveBeenCalled()
  })

  it('stays generic for the refusals a person cannot act on', async () => {
    for (const refused of ['claimed_by_another', 'not_claimable'] as const) {
      vi.mocked(bindProfileOnFirstLogin).mockResolvedValue({ refused })
      expect(locationOf(await call())).toBe('/login?error=signin')
    }
  })

  it('never records consent or announces an activation for a refusal', async () => {
    vi.mocked(bindProfileOnFirstLogin).mockResolvedValue({ refused: 'guardian_consent_required' })

    await call()

    expect(recordConsentAcceptance).not.toHaveBeenCalled()
    expect(notifyAccountActivated).not.toHaveBeenCalled()
  })
})

describe('GET /auth/callback - a successful first login', () => {
  it('forwards to the app and leaves the session alone', async () => {
    vi.mocked(bindProfileOnFirstLogin).mockResolvedValue({ profileId: 'p1', activated: true })
    vi.mocked(recordConsentAcceptance).mockResolvedValue(undefined as never)

    const res = await call()

    expect(locationOf(res)).toBe('/dashboard')
    expect(signOut).not.toHaveBeenCalled()
    // Parity with password registration: activation records consent and tells the managers.
    expect(recordConsentAcceptance).toHaveBeenCalledWith('p1')
    expect(notifyAccountActivated).toHaveBeenCalledWith('p1')
  })

  it('does not re-record consent for a returning user (activated: false)', async () => {
    vi.mocked(bindProfileOnFirstLogin).mockResolvedValue({ profileId: 'p1', activated: false })

    expect(locationOf(await call())).toBe('/dashboard')
    expect(recordConsentAcceptance).not.toHaveBeenCalled()
  })

  it('honours an internal next, and refuses an off-site one', async () => {
    vi.mocked(bindProfileOnFirstLogin).mockResolvedValue({ profileId: 'p1', activated: false })

    expect(locationOf(await call('?code=abc&next=/messages'))).toBe('/messages')
    expect(locationOf(await call('?code=abc&next=//evil.example.com'))).toBe('/dashboard')
  })
})
