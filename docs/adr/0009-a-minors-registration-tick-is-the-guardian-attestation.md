# 0009 — A minor's registration tick is the guardian attestation

- **Date:** 2026-10-12
- **Status:** Accepted

## Context

A student could not create an account by any route, and the reason was two sound decisions
colliding.

On 2 September, guardian consent was required only when there was a SIGNAL that the student was a
minor — a guardian on record, or a date of birth under 18 — and with neither signal registration
was allowed. A round-5 audit called that fail-open, so `requiresGuardianConsent` was tightened: a
student is a minor unless a date of birth proves otherwise. The academy is KG-12 and invites carry
no date of birth, so in practice every student is now a minor.

On 27 September the register form's consent tick was hidden behind `SHOW_GUARDIAN_CONSENT` because
it asked a registering person to confirm a guardian agreed to terms that were still being drafted.
The commit said plainly that the server rule was left untouched and that consent therefore could
not be given while the box was hidden.

Each change is right on its own. Together they left students with no door: the password path
demands a consent the form no longer collects, and OAuth activation refuses minors by design
(ADR-0008's neighbour rule in `lib/auth/binding.ts`) precisely because Google captures no
attestation. The Terms and Privacy pages have since been published and versioned
(`POLICY_EFFECTIVE_DATE`), and the academy accepts them as the terms it enrols against.

## Decision

Guardian consent is captured as an **explicit attestation made at registration, against a named
policy version**.

- **One required tick for every registrant**, worded to cover the case the form cannot detect:
  "I agree to the Terms of Use and Privacy Policy. If the account holder is under 18, I confirm a
  parent or guardian has read them and consents on their behalf." The form is a single step and
  learns who is registering only after the email and code validate server-side, so the wording is
  conditional rather than tailored.
- **The policy is readable where it is agreed to.** Both names open a modal containing the real
  policy body, not a summary and not a link that navigates away mid-registration. The bodies move
  to `src/lib/policy/`, beside the versions they are stamped with, and the marketing pages and the
  modal render the same components — so what a person read cannot drift from what the consent row
  names. The register page passes them to the client form as element props, keeping ~230 lines of
  policy text out of the client bundle, which sits at 127.9 KB against a 133 KB budget.
- **The server decides what is recorded.** A tick from a registrant the server has resolved as a
  minor records `guardian_consent: true`; the identical payload from an adult records a plain
  acceptance. The form cannot assert it, because the form does not know.
- `SHOW_GUARDIAN_CONSENT` is removed. The tick is unconditional, so the flag has nothing to gate.

**This reverses a rule stated in the code.** `lib/services/consents.ts` held that "a child
completing their OWN setup is not guardian consent and must never be logged as such". That comment
is replaced, not contradicted in silence: the tick is not an incidental by-product of a child
setting up an account, it is a specific statement that a named adult has read the policy and
consents, recorded with its version and timestamp, and the academy accepts it as the lawful basis.

## Consequences

- Students can register. That is the point, and no other change achieves it without either leaving
  the consent uncollected or waiting on email.
- **What this is not: verifiable parental consent in the strong sense.** A child can tick the box
  without asking anyone. The record is an attestation, not proof, and it should be described that
  way in any assessment rather than as verified consent.
- The strongest version of this needs the guardian to act: a consent link sent to the guardian's
  own address, recorded against them. That is blocked while email is deferred, and it is the
  upgrade this decision should be replaced by, not merely supplemented with.
- Because the guardian's name and phone are already captured at invite (`guardians`), a later
  guardian-side flow has somewhere to send the request without re-asking the student.
- A policy version change invalidates nothing retroactively: the consent log is append-only and
  `getConsentStatus().upToDate` already drives re-acceptance.

## Follow-up work

- The guardian-side consent link, when `EMAIL_NOTIFICATIONS_ENABLED` is on. It supersedes this.
- Recording a date of birth at invite would stop adult students being treated as minors, and is
  worth doing on its own merits; it does not change this decision.
- `privacy-features-defaults` (the N-01 note) records the 2 September shape and needs updating to
  this one, so the next reader does not implement the superseded rule.
