import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/consents', () => ({ insertConsent: vi.fn(), selectLatestConsent: vi.fn() }))

import { insertConsent, selectLatestConsent } from '@/lib/data/consents'
import { getConsentStatus, needsPolicyReacceptance, reaffirmCurrentConsent } from '@/lib/services/consents'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/policy/versions'

const row = (over: Record<string, unknown> = {}) => ({
  terms_version: TERMS_VERSION,
  privacy_version: PRIVACY_VERSION,
  guardian_consent: false,
  cross_border_consent: false,
  accepted_at: '2026-08-25T10:00:00.000Z',
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('getConsentStatus / needsPolicyReacceptance (N-06/N-07)', () => {
  it('reports up-to-date when the latest accepted versions match the current ones', async () => {
    vi.mocked(selectLatestConsent).mockResolvedValue(row() as never)
    const status = await getConsentStatus('u1')
    expect(status.upToDate).toBe(true)
    expect(status.acceptedTermsVersion).toBe(TERMS_VERSION)
    expect(await needsPolicyReacceptance('u1')).toBe(false)
  })

  it('needs re-acceptance when the accepted version is older than the current one', async () => {
    vi.mocked(selectLatestConsent).mockResolvedValue(row({ terms_version: '2020-01-01' }) as never)
    const status = await getConsentStatus('u1')
    expect(status.upToDate).toBe(false)
    expect(status.acceptedTermsVersion).toBe('2020-01-01')
    expect(status.currentTermsVersion).toBe(TERMS_VERSION)
    expect(await needsPolicyReacceptance('u1')).toBe(true)
  })

  it('needs acceptance when there is no consent on record at all', async () => {
    vi.mocked(selectLatestConsent).mockResolvedValue(null)
    const status = await getConsentStatus('u1')
    expect(status.upToDate).toBe(false)
    expect(status.acceptedAt).toBeNull()
    expect(await needsPolicyReacceptance('u1')).toBe(true)
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
