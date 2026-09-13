import 'server-only'
import {
  insertConsent,
  markLatestConsentWithdrawn,
  selectLatestConsent,
  selectProfileIdsWithCurrentConsent,
} from '@/lib/data/consents'
import { selectActiveProfileIds } from '@/lib/data/profiles-directory'
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
  /** When the standing acceptance was withdrawn, or null while it stands (N-07). */
  withdrawnAt: string | null
  /** True only when a consent exists, is NOT withdrawn, and both accepted versions match
   *  the current ones. A withdrawal makes this false, so the same UI that prompts after a
   *  policy update also prompts after a withdrawal. */
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
    latest != null &&
    latest.withdrawn_at == null &&
    latest.terms_version === TERMS_VERSION &&
    latest.privacy_version === PRIVACY_VERSION
  return {
    acceptedTermsVersion: latest?.terms_version ?? null,
    acceptedPrivacyVersion: latest?.privacy_version ?? null,
    acceptedAt: latest?.accepted_at ?? null,
    withdrawnAt: latest?.withdrawn_at ?? null,
    currentTermsVersion: TERMS_VERSION,
    currentPrivacyVersion: PRIVACY_VERSION,
    upToDate,
  }
}

// needsPolicyReacceptance() lived here and had no callers in any round it was reported.
// It was a one-line negation of getConsentStatus().upToDate, which the settings page
// already reads directly to decide whether to show the re-acceptance form. Keeping a
// duplicate entry point that nothing calls is how the two drift; the live path is
// getConsentStatus, and `upToDate` now also accounts for withdrawal (N-07).

/** Record a fresh acceptance of the CURRENT policy versions. The log is append-only,
 *  so re-affirming simply adds the current-version row - the prior acceptances stay on record. */
export async function reaffirmCurrentConsent(profileId: string): Promise<void> {
  await recordConsentAcceptance(profileId)
}

/**
 * Withdraw the standing consent. The privacy policy offers withdrawal, and until now the
 * schema had no way to express it - the log could only ever say "accepted" (N-07).
 *
 * Withdrawal does NOT erase: the acceptance stays on the append-only log as the historical
 * fact that it was given, and a marker records that it was later revoked. Erasure is a
 * separate, heavier request with its own path.
 */
export async function withdrawConsent(profileId: string): Promise<void> {
  await markLatestConsentWithdrawn(profileId, new Date().toISOString())
}

/** How many missing-consent profile ids the sweep reports back. The COUNT is exact; the
 *  id list is a sample, so a large gap cannot turn one cron response into a bulk export. */
const REPORTED_IDS = 50

export type ConsentReconcileResult = {
  activeProfiles: number
  withCurrentConsent: number
  /** Exact number of active profiles holding no current, un-withdrawn acceptance. */
  missing: number
  /** At most REPORTED_IDS of them, for following up. */
  missingProfileIds: string[]
}

/**
 * Find active people with no current acceptance on the consent log.
 *
 * WHY THIS EXISTS: recording acceptance is deliberately best-effort - registration and the
 * OAuth callback both `await ... .catch(log)` so that a consent-write hiccup cannot fail an
 * account that is already bound. That trade-off is right, but it leaves a gap nothing
 * noticed: the row is missing, the failure is a line in a log nobody reads, and the only
 * surface that would reveal it is the settings page, which the person may never open.
 * An append-only trail the privacy policy promises must not be able to lose an entry
 * silently.
 *
 * IT DOES NOT WRITE CONSENT. A sweep cannot know that someone accepted; inserting a row to
 * make the numbers agree would forge the very fact the log exists to evidence. It reports,
 * and a human decides - re-prompting through the settings page is the honest repair.
 *
 * Both reads are paged, because `profiles` and `consents` each grow with the academy and a
 * truncated read would silently shrink the population the sweep claims to have checked.
 */
export async function reconcileConsents(): Promise<ConsentReconcileResult> {
  const [active, consented] = await Promise.all([
    selectActiveProfileIds(),
    selectProfileIdsWithCurrentConsent(TERMS_VERSION, PRIVACY_VERSION),
  ])
  const holders = new Set(consented)
  const missing = active.filter((id) => !holders.has(id))
  return {
    activeProfiles: active.length,
    withCurrentConsent: holders.size,
    missing: missing.length,
    missingProfileIds: missing.slice(0, REPORTED_IDS),
  }
}
