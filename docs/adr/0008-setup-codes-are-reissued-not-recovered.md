# 0008 — Setup codes are re-issued, never recovered

- **Date:** 2026-10-12
- **Status:** Accepted

## Context

An admin adds a user, the one-time setup code is shown once, and the admin closes the panel without
saving it. The person cannot self-register a password, and the only recourse today is a developer
running SQL by hand (`PROD-6b` does exactly this for the founding admins).

The code is not recoverable. `lib/auth/setup-code.ts` stores `sha256(upper(code))` in
`profiles.setup_code_hash` and keeps the plaintext nowhere, so no query can read it back. The
instinct to "just show it to a super admin until the account is claimed" would require storing the
code recoverably — in the table, and in every backup and export taken while an invite is
outstanding.

Two facts narrow the problem. A lost code blocks only the PASSWORD route: Google sign-in needs no
code, so the account is not stranded. And the existing hash is weaker than it looks — eight
characters over a 32-symbol alphabet is about 2^40, unsalted, so anyone who can already read the
table can brute-force an outstanding code. The reason not to store the plaintext is therefore not
that the hash is strong; it is that a readable code turns "can read the database" into "can claim a
pending account" with no work at all, including from an old backup.

## Decision

A setup code is **issued**, never **read back**. Recovery is replacement:

- An admin may re-issue a code for a profile that has not been claimed. The write is scoped to
  `auth_user_id is null`, so it refuses an account that has already signed in rather than quietly
  resetting a live user. The previous code stops working — that is the intent, not a side effect.
- Re-issue reuses `canManageTarget(actor, role)`, the gate `addUser` already applies. A sub-admin may
  re-issue for a tutor, mentor or student and may not re-issue for an admin, so re-issue cannot
  become a privilege-escalation path. No new capability is introduced.
- Whether a code is outstanding, and when it expires, IS shown to admins. That reads
  `setup_code_expires_at`, which is already stored, and tells an admin what they need to know
  without anything secret being readable.
- Because the code is shown once per issue, the issuing surface hands the admin a complete,
  copyable invite message — the person's name and email, the code, the `/register` link and the
  expiry — so the natural next action is to send it on rather than to memorise it.

## Consequences

- No schema change. `setup_code_hash` and `setup_code_expires_at` already carry everything needed.
- An outstanding code is never readable by anyone: not an admin, not a developer with database
  access, not a backup. The blast radius of a leaked backup does not include pending accounts.
- A lost code costs one click instead of a developer and a hand-written `UPDATE`.
- Re-issuing invalidates the old code, so an admin who re-issues while the person is mid-registration
  will strand that attempt. Acceptable: the person retries with the code they were just sent.
- The audit trail records `user.reissue_code`, so repeated re-issues against one account are
  visible after the fact.

## Follow-up work

- If re-issue proves too fiddly in practice, the fallback is to keep the live code readable until the
  account is claimed. That is a deliberate reversal of this ADR and must be recorded as one, with the
  backup-exposure consequence stated.
- The unsalted SHA-256 over a ~2^40 keyspace is worth strengthening on its own merits (an HMAC with a
  server-side secret, or a slow hash). Independent of this decision, and not required by it.
- Emailing the code to the person on creation would make a lost code irrelevant. Blocked while email
  is deferred; revisit when `EMAIL_NOTIFICATIONS_ENABLED` is on.
