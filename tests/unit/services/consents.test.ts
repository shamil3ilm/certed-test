import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/consents', () => ({
  insertConsent: vi.fn(),
  selectLatestConsent: vi.fn(),
  markLatestConsentWithdrawn: vi.fn(),
}))

import { insertConsent, markLatestConsentWithdrawn, selectLatestConsent } from '@/lib/data/consents'
import { getConsentStatus, reaffirmCurrentConsent, withdrawConsent } from '@/lib/services/consents'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/policy/versions'

const row = (over: Record<string, unknown> = {}) => ({
  terms_version: TERMS_VERSION,
  privacy_version: PRIVACY_VERSION,
  guardian_consent: false,
  cross_border_consent: false,
  accepted_at: '2026-08-25T10:00:00.000Z',
  withdrawn_at: null,
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('getConsentStatus', () => {
  it('reports up-to-date when the latest accepted versions match the current ones', async () => {
    vi.mocked(selectLatestConsent).mockResolvedValue(row() as never)
    const status = await getConsentStatus('u1')
    expect(status.upToDate).toBe(true)
    expect(status.acceptedTermsVersion).toBe(TERMS_VERSION)
  })

  it('needs re-acceptance when the accepted version is older than the current one', async () => {
    vi.mocked(selectLatestConsent).mockResolvedValue(row({ terms_version: '2020-01-01' }) as never)
    const status = await getConsentStatus('u1')
    expect(status.upToDate).toBe(false)
    expect(status.acceptedTermsVersion).toBe('2020-01-01')
    expect(status.currentTermsVersion).toBe(TERMS_VERSION)
  })

  it('needs acceptance when there is no consent on record at all', async () => {
    vi.mocked(selectLatestConsent).mockResolvedValue(null)
    const status = await getConsentStatus('u1')
    expect(status.upToDate).toBe(false)
    expect(status.acceptedAt).toBeNull()
  })
})

describe('reaffirmCurrentConsent', () => {
  it('appends a fresh acceptance of the CURRENT versions', async () => {
    await reaffirmCurrentConsent('u1')
    expect(insertConsent).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: 'u1', terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION }),
    )
  })
})

describe('consent withdrawal (N-07)', () => {
  it('a withdrawn acceptance is no longer up to date, so the app re-prompts', async () => {
    // The policy offers withdrawal; before this the log could only ever say "accepted".
    vi.mocked(selectLatestConsent).mockResolvedValue(row({ withdrawn_at: '2026-09-05T09:00:00.000Z' }) as never)
    const status = await getConsentStatus('u1')
    expect(status.withdrawnAt).toBe('2026-09-05T09:00:00.000Z')
    expect(status.upToDate, 'a withdrawal must re-open the acceptance prompt').toBe(false)
    // The historical fact is preserved, not erased.
    expect(status.acceptedTermsVersion).toBe(TERMS_VERSION)
    expect(status.acceptedAt).toBe('2026-08-25T10:00:00.000Z')
  })

  it('withdrawing marks the standing acceptance rather than deleting it', async () => {
    await withdrawConsent('u1')
    expect(markLatestConsentWithdrawn).toHaveBeenCalledWith('u1', expect.any(String))
    expect(insertConsent, 'withdrawal is not a new acceptance').not.toHaveBeenCalled()
  })
})
