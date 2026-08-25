/**
 * The current published Terms of Use and Privacy Policy versions. Single source of
 * truth for BOTH the version stamped on a recorded consent (consents table) and the
 * "Last updated" line shown on the public policy pages, so the record and the page can
 * never disagree. Bump these (to the new effective date) whenever the policy text
 * changes so re-acceptance records the new version.
 */
export const POLICY_EFFECTIVE_DATE = '2026-08-25'

export const TERMS_VERSION = POLICY_EFFECTIVE_DATE
export const PRIVACY_VERSION = POLICY_EFFECTIVE_DATE
