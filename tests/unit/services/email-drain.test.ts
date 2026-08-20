import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email/resend', () => ({ emailEnabled: vi.fn(() => true), sendEmail: vi.fn() }))
vi.mock('@/lib/data/pending-emails', () => ({
  claimPendingEmails: vi.fn(),
  requeueStaleClaims: vi.fn(),
  markEmailSent: vi.fn(),
  markEmailFailed: vi.fn(),
}))

import { emailEnabled, sendEmail } from '@/lib/email/resend'
import { claimPendingEmails, requeueStaleClaims, markEmailSent, markEmailFailed } from '@/lib/data/pending-emails'
import { drainPendingEmails } from '@/lib/services/email-drain'

beforeEach(() => vi.resetAllMocks())

describe('drainPendingEmails', () => {
  it('does nothing when email is disabled - the queue is left intact, nothing claimed', async () => {
    vi.mocked(emailEnabled).mockReturnValue(false)
    await expect(drainPendingEmails()).resolves.toEqual({ processed: 0, sent: 0, failed: 0, retried: 0 })
    expect(requeueStaleClaims).not.toHaveBeenCalled()
    expect(claimPendingEmails).not.toHaveBeenCalled()
  })

  it('reaps stale claims, then claims and sends each email and marks it sent', async () => {
    vi.mocked(emailEnabled).mockReturnValue(true)
    vi.mocked(requeueStaleClaims).mockResolvedValue()
    vi.mocked(claimPendingEmails).mockResolvedValue([
      { id: 'e1', to_email: 'a@test.dev', subject: 'S', html: '<p>H</p>', attempts: 0 },
      { id: 'e2', to_email: 'b@test.dev', subject: 'S', html: '<p>H</p>', attempts: 0 },
    ])
    vi.mocked(sendEmail).mockResolvedValue(true)

    const result = await drainPendingEmails()

    // Stale-claim reap runs before the claim, so a crashed pass's rows are retried.
    expect(requeueStaleClaims).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(markEmailSent).toHaveBeenCalledWith('e1', 1)
    expect(markEmailSent).toHaveBeenCalledWith('e2', 1)
    expect(result).toEqual({ processed: 2, sent: 2, failed: 0, retried: 0 })
  })

  it('retries a failed send, then parks it as failed once attempts are exhausted', async () => {
    vi.mocked(emailEnabled).mockReturnValue(true)
    vi.mocked(requeueStaleClaims).mockResolvedValue()
    vi.mocked(claimPendingEmails).mockResolvedValue([
      { id: 'fresh', to_email: 'a@test.dev', subject: 'S', html: 'h', attempts: 0 }, // -> attempt 1, retry
      { id: 'last', to_email: 'b@test.dev', subject: 'S', html: 'h', attempts: 2 }, // -> attempt 3, terminal
    ])
    vi.mocked(sendEmail).mockResolvedValue(false) // provider failure / disabled

    const result = await drainPendingEmails()

    expect(markEmailFailed).toHaveBeenCalledWith('fresh', 1, false, expect.any(String)) // 1 < 3 -> back to pending
    expect(markEmailFailed).toHaveBeenCalledWith('last', 3, true, expect.any(String)) // 3 >= 3 -> failed
    expect(markEmailSent).not.toHaveBeenCalled()
    expect(result).toEqual({ processed: 2, sent: 0, failed: 1, retried: 1 })
  })
})
