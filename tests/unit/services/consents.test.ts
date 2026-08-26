import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/consents', () => ({ insertConsent: vi.fn() }))

import { insertConsent } from '@/lib/data/consents'
import { recordConsentAcceptance } from '@/lib/services/consents'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/policy/versions'

beforeEach(() => vi.resetAllMocks())

describe('recordConsentAcceptance', () => {
  it('records ONLY the accepted policy versions; asserts no signal the flow did not capture', async () => {
    await recordConsentAcceptance('p1')
    expect(insertConsent).toHaveBeenCalledWith({
      profile_id: 'p1',
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      // Self-setup captures neither guardian consent, an affirmative cross-border consent,
      // nor a jurisdiction - so none are asserted (the transfer basis is still being
      // finalised in the policy, and a child's own acceptance is not guardian consent).
      guardian_consent: false,
      cross_border_consent: false,
      jurisdiction: null,
    })
  })

  it('passes through the signals a caller genuinely captures', async () => {
    await recordConsentAcceptance('p2', { guardianConsent: true, crossBorderConsent: true, jurisdiction: 'IN' })
    expect(insertConsent).toHaveBeenCalledWith(
      expect.objectContaining({ guardian_consent: true, cross_border_consent: true, jurisdiction: 'IN' }),
    )
  })
})
