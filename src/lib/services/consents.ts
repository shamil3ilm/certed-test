import 'server-only'
import { insertConsent, selectLatestConsent } from '@/lib/data/consents'
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

export type ConsentStatus = {
  /** The versions the person last accepted, null if they have no consent on record. */
  acceptedTermsVersion: string | null
  acceptedPrivacyVersion: string | null
  acceptedAt: string | null
  currentTermsVersion: string
  currentPrivacyVersion: string
  /** True only when a consent exists AND both accepted versions match the current ones. */
  upToDate: boolean
}

/**
 * A person's consent standing: which Terms + Privacy versions they last accepted, when, and
 * whether that matches the CURRENTLY published versions. Reads the append-only log so the
 * UI can show what was accepted and prompt re-acceptance when the policy has since changed.
 */
export async function getConsentStatus(profileId: string): Promise<ConsentStatus> {
  const latest = await selectLatestConsent(profileId)
  const upToDate =
    latest != null && latest.terms_version === TERMS_VERSION && latest.privacy_version === PRIVACY_VERSION
  return {
    acceptedTermsVersion: latest?.terms_version ?? null,
    acceptedPrivacyVersion: latest?.privacy_version ?? null,
    acceptedAt: latest?.accepted_at ?? null,
    currentTermsVersion: TERMS_VERSION,
    currentPrivacyVersion: PRIVACY_VERSION,
    upToDate,
  }
}

/** True when the person needs to (re-)accept: no consent on record, or the policy has been
 *  published in a newer version than they last accepted. */
export async function needsPolicyReacceptance(profileId: string): Promise<boolean> {
  return !(await getConsentStatus(profileId)).upToDate
}

/** Record a fresh acceptance of the CURRENT policy versions. The log is append-only,
 *  so re-affirming simply adds the current-version row - the prior acceptances stay on record. */
export async function reaffirmCurrentConsent(profileId: string): Promise<void> {
  await recordConsentAcceptance(profileId)
}
