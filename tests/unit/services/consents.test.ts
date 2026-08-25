import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/consents', () => ({ insertConsent: vi.fn() }))

import { insertConsent } from '@/lib/data/consents'
import { recordConsentAcceptance } from '@/lib/services/consents'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/policy/versions'

beforeEach(() => vi.resetAllMocks())

describe('recordConsentAcceptance', () => {
  it('records the current Terms + Privacy versions with cross-border consent set', async () => {
    await recordConsentAcceptance('p1')
    expect(insertConsent).toHaveBeenCalledWith({
      profile_id: 'p1',
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      guardian_consent: false,
      cross_border_consent: true,
      jurisdiction: null,
    })
  })

  it('passes through guardian consent and jurisdiction when provided', async () => {
    await recordConsentAcceptance('p2', { guardianConsent: true, jurisdiction: 'IN' })
    expect(insertConsent).toHaveBeenCalledWith(expect.objectContaining({ guardian_consent: true, jurisdiction: 'IN' }))
  })
})
