import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/mock/env', () => ({ isMock: () => false }))
vi.mock('@/lib/security/rate-limit-shared', () => ({ rateLimitShared: async () => ({ ok: true, retryAfterSec: 0 }) }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/data/profiles', () => ({ updateOwnProfile: vi.fn(), updateProfile: vi.fn() }))
vi.mock('@/lib/data/auth-accounts', () => ({
  updateOwnAuthPassword: vi.fn(),
  signOutOwnOtherSessions: vi.fn(),
  updateAuthUserEmail: vi.fn(),
  verifyOwnPassword: vi.fn(async () => true),
}))
vi.mock('@/lib/services/users/directory', () => ({ getProfileByEmail: vi.fn(async () => null) }))
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn() }))
// Async: the real one returns a promise and the caller attaches a .catch to it.
vi.mock('@/lib/data/pending-emails', () => ({ enqueuePendingEmails: vi.fn(async () => {}) }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { notifyBestEffort } from '@/lib/services/notifications'
import { enqueuePendingEmails } from '@/lib/data/pending-emails'
import { changeOwnEmail, changeOwnPassword } from '@/lib/services/users/self-service'

const actor = { id: 'p1', email: 'old@x.dev', auth_user_id: 'auth-1' } as any

beforeEach(() => vi.clearAllMocks())

/**
 * A credential change is the one event whose audience is the account OWNER rather than a member
 * of staff: if they did not make the change, this is the signal that somebody else holds their
 * session. Nothing reported either change before.
 */
describe('credential changes tell the owner', () => {
  it('notifies the owner that their password changed', async () => {
    await changeOwnPassword(actor, 'new-password-123', 'current-pw')
    expect(notifyBestEffort).toHaveBeenCalledWith(
      ['p1'],
      expect.objectContaining({ kind: 'security', title: 'Your password was changed' }),
    )
  })

  it('emails the PREVIOUS address when the sign-in email changes', async () => {
    await changeOwnEmail(actor, 'new@x.dev', 'current-pw')

    // The in-app notice resolves its address from the profile, which now holds the NEW email -
    // so on its own it tells whoever made the change and nobody else.
    expect(notifyBestEffort).toHaveBeenCalledWith(
      ['p1'],
      expect.objectContaining({ kind: 'security', title: 'Your sign-in email was changed' }),
    )
    // The previous address is therefore mailed directly: it belongs to the person who needs to
    // know, and after the change nothing else would reach them.
    expect(enqueuePendingEmails).toHaveBeenCalledWith([
      expect.objectContaining({ to_email: 'old@x.dev', subject: 'Your sign-in email was changed' }),
    ])
  })

  it('says nothing when the email is unchanged - a resubmit is not a change', async () => {
    await changeOwnEmail(actor, ' OLD@x.dev ', 'current-pw')
    expect(notifyBestEffort).not.toHaveBeenCalled()
    expect(enqueuePendingEmails).not.toHaveBeenCalled()
  })
})
