import 'server-only'
import { insertConsent } from '@/lib/data/consents'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/policy/versions'

/**
 * Record a person's acceptance of the CURRENT Terms + Privacy Policy - the audit
 * trail the privacy policy promises (which version was accepted, and when). Called
 * when someone sets up their account. Accepting the privacy policy (which discloses
 * that data is held in Singapore) is the cross-border-storage consent, so that flag is
 * set. `guardianConsent` is for the minor case, captured by the caller when known.
 */
export async function recordConsentAcceptance(
  profileId: string,
  opts: { guardianConsent?: boolean; jurisdiction?: string | null } = {},
): Promise<void> {
  await insertConsent({
    profile_id: profileId,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    guardian_consent: opts.guardianConsent ?? false,
    cross_border_consent: true,
    jurisdiction: opts.jurisdiction ?? null,
  })
}
