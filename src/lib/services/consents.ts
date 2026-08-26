import 'server-only'
import { insertConsent } from '@/lib/data/consents'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/policy/versions'

/**
 * Record a person's acceptance of the CURRENT Terms + Privacy Policy - the append-only
 * audit trail the privacy policy promises: which versions were accepted, and when.
 * Called when someone completes account setup (the register form states that completing
 * it is the acceptance).
 *
 * Records ONLY the signals actually captured at the call site. The self-setup flow
 * captures just the account holder's acceptance of the two policy versions, so it passes
 * no options and the remaining columns keep their honest defaults - a record must not
 * assert a signal the flow never captured:
 *   - guardian_consent -> false unless a genuine guardian-consent step captured it. A
 *     child completing their OWN setup is not guardian consent and must never be logged
 *     as such (the policy names guardian consent as the lawful basis for a minor).
 *   - cross_border_consent -> false unless a distinct cross-border step captured it. The
 *     policy states the transfer basis is still being finalised, so accepting the policy
 *     is NOT an affirmative cross-border consent and is not recorded as one.
 *   - jurisdiction -> null unless the caller resolved the data subject's jurisdiction.
 * A future flow that genuinely captures any of these passes it explicitly.
 */
export async function recordConsentAcceptance(
  profileId: string,
  opts: { guardianConsent?: boolean; crossBorderConsent?: boolean; jurisdiction?: string | null } = {},
): Promise<void> {
  await insertConsent({
    profile_id: profileId,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    guardian_consent: opts.guardianConsent ?? false,
    cross_border_consent: opts.crossBorderConsent ?? false,
    jurisdiction: opts.jurisdiction ?? null,
  })
}
