# Production Security Audit — Cert-Ed Academia

**Date:** 2026-08-20
**Target:** `c:\laragon\www\wed_cert` @ `feature/cert-ed-academia-app` (2bda9c0, 200 commits ahead of origin)
**Stack:** Next.js 16 (App Router, `src/proxy.ts` middleware) · React 19 · Supabase/PostgreSQL · Google Drive (custodial storage) · Google Apps Script (contact form) · Resend · Sentry · Vercel
**Scope:** full repository — source, config, dependencies, routes, APIs, schema/RLS, auth, frontend, storage, deployment, CI/CD, git history, integrations.

---

## 0. Note on `/claude-security`

**`/claude-security` does not exist in this installation and could not be executed.** No command, skill, or plugin by that name is present in `~/.claude/commands`, `~/.claude/plugins` (cache or marketplaces), or the project's `.claude/`.

The closest equivalent — Claude Code's **built-in `security-review` skill** — was run in its place and is reported as **Audit A**. It was executed per its own prescribed methodology (parallel finder sub-tasks over the branch diff, then a false-positive filter, retaining only findings at confidence ≥ 8). Its scope is narrower than this brief by design: it **excludes** DoS/resource exhaustion, rate limiting, secrets-at-rest, dependency CVEs, missing audit logs, and anything in documentation. Those exclusions matter for the comparison in §5.

**Audit B** is an independent review performed directly against the source, covering the full 39-point brief without those exclusions.

---

## Remediation status (re-verified 2026-08-23)

Re-verified against current code — typecheck clean · 1153 unit tests · RLS 34/34 on real
Postgres · build + client-manifest guard green. (Fixes are on the feature branch; some
uncommitted pending the schema commit.)

**🆕 New code since the audit — scanned, no new findings**

- **`consents` (0073)** and **`guardians` (0076)** tables: RLS enabled with a **read-only
  self+admin policy and NO write policy** → all writes are service-role-only (RLS denies
  authenticated/anon writes even though the Data API exposes the tables).
- **Guardian-management service** (`services/guardians.ts`): every mutation re-checks the
  tier via `requireManageableTarget`, is Zod-validated, and every data-layer op is
  **scoped by `student_id`** (no IDOR); `student_id` is passed separately from the
  validated schema (no mass-assignment). 9 unit tests cover the tier gate + validation.
- The A-12 / B-03 / B-05 fixes introduced no new surface.

**✅ Fixed / verified fixed**

- **A-01** — `saveOrgProfileAction` now `requireRole(['admin'])`, not `manageUsers`.
- **A-02** — `assertSubmissionAcceptsWork` gates attach on own + active + ungraded + open deadline.
- **A-03** — migration `0067` enforces the deadline in `replace_own_submission` and revokes direct `submissions` INSERT.
- **A-05** — `cookie-options.ts` sets `secure` in production for both Supabase clients.
- **A-08** — the user-detail read gates on `canManageTarget` (same tier rule as writes).
- **A-11** — session `tutor_id`: explicit id is admin-only + `validateUuidField` + `assertClassTutor`.
- **A-12** — `resources.ts` `.or()` search now uses `escapeOrIlike` (was `escapeIlike`). _(2026-08-23)_
- **A-14** — resource attach authorizes `'edit'` on replacement + passes `uploaded_by`.
- **B-03** — `clientIp` prefers `x-vercel-forwarded-for` / rightmost XFF, not the spoofable leftmost. _(2026-08-23)_
- **B-05** — `/api/contact` no longer reflects the upstream Apps Script error to the caller. _(2026-08-23)_
- **B-08** — `class-write.ts` comment corrected. Sentry PII `beforeSend` scrubber added; mock-mode gate now also fails closed on `NODE_ENV==='production'`.

**🎯 Open — design decision required (coupled)**

- **A-07 + A-10** — a mentor (and a tutor-who-mentors) gets tutor-level class/document WRITE via `teaches_class()` RLS and `documentRoleFor`. Resolving needs a product call on whether that authority is intended, plus a `teaches_class` read/write split (migration) and class-scoped role resolution.

**🛠️ Open — involved code (next)**

- **A-04** — require current password before email/password change; drop `email_confirm:true`; revoke other sessions.
- **A-09** — make `canManageClass`/`isClassAdmin` override-aware (currently reads the persona baseline; needs resolved caps in the foundational `lib/permission` layer).
- **B-01** — route password reset through a server action so `changePasswordSchema` is authoritative.

**🔧 Open — ops / config (not code)**

- **B-02 / §3.1** — Supabase dashboard controls (leaked-password, min length, brute-force, signup, OAuth allowlist, token rotation, session expiry) — UNKNOWN until verified.
- **B-04** — shared secret between the relay and the Apps Script endpoint (script is external).
- **B-06** — RLS harness re-grants table-wide DML after migrations, masking the column-grant boundary (test-infra; the "move before the loop" hint is itself flawed — tables don't exist yet — needs a rethink).
- **B-11** — bootstrap seed script uses legacy `role:'teacher'` + `onConflict` overwrite.

**🔽 Open — low / latent / accepted**

- A-06 (`httpOnly:false` — architecturally required by `@supabase/ssr`; CSP-mitigated; accepted), A-13 (entity_tags RLS latent, not reachable), A-15 (revoked messaging — no live read exposure), B-09 (client-only idle logout), B-10 (setup code not required on the Google path), B-12 (`student_feedback` shared key — needs a migration), B-13 (`ownerId` uuid validation), CSP `form-action`, CI token scope.

---

## 1. Claude Security findings (Audit A — built-in `security-review`)

Post-filter set (confidence ≥ 8, HIGH/MEDIUM only, skill exclusions applied).

| ID   | Sev      | Location                                                                         | Finding                                                                                                                                                                                                                                                                                                                                                                |
| ---- | -------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01 | **HIGH** | `src/app/(prt)/admin/settings/actions.ts:27`                                     | Org-settings write (incl. bank account/IFSC/branch, signatory, doc prefixes) gated on `manageUsers`, which `sub_admin` holds — DB policy reserves `org_settings` to `is_active_admin()`; service-role write bypasses RLS; service adds no re-check.                                                                                                                    |
| A-02 | **HIGH** | `src/app/api/attachments/route.ts:36-40`                                         | `assertMayAttach` checks submission ownership only — no `is_active`, no `graded_at`, no deadline. Student attaches work to an open submission id after a hard deadline, or replaces the file on already-graded work.                                                                                                                                                   |
| A-03 | **HIGH** | `0012_atomic_submission_replace.sql:83`, `0003_content.sql:112`                  | `enforce_deadline` exists only in app code. `replace_own_submission` (granted to `authenticated`) and a direct `INSERT` on `submissions` both reach the table via PostgREST with no deadline check.                                                                                                                                                                    |
| A-04 | MEDIUM   | `src/lib/services/users/self-service.ts:70` → `src/lib/data/auth-accounts.ts:45` | Login email changed via the **admin** API with `email_confirm: true` — no re-auth, no ownership proof, no notice to the old address. Password change likewise needs no current password. Session cookie becomes a single sufficient factor for permanent takeover.                                                                                                     |
| A-05 | MEDIUM   | `@supabase/ssr` `DEFAULT_COOKIE_OPTIONS`; never overridden                       | Session cookies carry no `Secure` attribute (`secure` appears nowhere in the dist); HSTS lacks `preload`. First-visit / no-cached-HSTS requests can leak a 400-day refresh token in cleartext.                                                                                                                                                                         |
| A-06 | MEDIUM   | same                                                                             | `httpOnly: false` — access **and** refresh tokens readable via `document.cookie`. Architecturally required by `@supabase/ssr`'s browser client, but it escalates any XSS to refresh-token exfiltration.                                                                                                                                                                |
| A-07 | MEDIUM   | `supabase/rebuild/0000_full_rebuild.sql:862` (from `0043`)                       | `teaches_class()` ends `or mentors_class(...)`, and every class-scoped write policy keys off it. A student-scoped mentor persona therefore confers tutor-level **INSERT/UPDATE/DELETE** on attendance, assignments, announcements, resources, calendar, meet links, timetable — contradicting the mentor capability baseline, which grants no write capability at all. |
| A-08 | MEDIUM   | `src/app/(prt)/admin/users/[id]/page.tsx:15`                                     | Full-PII read (`phone`, `date_of_birth`, `gender`, `address`, guardian contacts) gated on `manageUsers` alone. Every **write** on the same record enforces `requireManageableTarget` (`SUB_ADMIN_MANAGEABLE = {tutor, student}`); the read does not. A sub_admin reads an admin's or mentor's home address and DOB.                                                    |
| A-09 | MEDIUM   | `src/lib/permission/personas.ts:91` → `src/lib/permission/class.ts:27`           | `isClassAdmin` uses `getBaseCapabilities` — the persona **baseline**, override-blind. An admin-issued `deny manageClasses` override blocks the nav and lifecycle actions but **not** `canManageClass`, so the target retains grading, attendance, enrolment and document-write authority academy-wide.                                                                 |
| A-10 | MEDIUM   | `src/lib/permission/documents.ts:47-52`                                          | `documentRoleFor` returns `'mentor'` for **any** mentor persona, including student-scoped. Mentor matrix is `edit/delete/share: 'yes'` vs tutor `'own'`. Assigning a tutor as a mentor silently promotes them to full edit/delete over other tutors' documents in the mentee's classes.                                                                                |
| A-11 | MEDIUM   | `src/lib/services/attendance/sessions.ts:80`                                     | `tutor_id` taken verbatim from the form — no UUID parse, no active-staff check, no class-scope check — and written through the service-role client. Sibling `timetable-slots.ts:57` guards the identical field with `assertClassTutor`.                                                                                                                                |
| A-12 | MEDIUM   | `src/lib/data/resources.ts:79,116`                                               | `escapeIlike` used inside a PostgREST `.or()` filter string; the `,` `(` `)` `"` `\` grammar characters survive. All five other `.or()` call sites use `escapeOrIlike`. Filter-predicate tampering + reliable 500.                                                                                                                                                     |
| A-13 | MEDIUM   | `0055_tags_entity_rls_hardening.sql:9`                                           | RLS policy dropped from `entity_tags` on the stated premise that reads move behind a service-layer check. That check was never written — `tagsForEntity` / `entityIdsForTag` are bare service-role pass-throughs. Latent, not currently reachable.                                                                                                                     |
| A-14 | MEDIUM   | `src/app/api/attachments/route.ts:42-47`                                         | Resource attachment authorized as `'upload'` (tutor = `yes`) rather than `'edit'` (tutor = `'own'`), with no `uploaded_by` passed. A tutor replaces the served file on a colleague's document — downloads return newest-first, no version snapshot, no `resource.edit` audit row.                                                                                      |
| A-15 | MEDIUM   | `src/lib/messaging/recipient-policy-resolver.ts:38,59,94,122`                    | `selectActiveIdsAmong` (the `profiles.status='active'` filter) applied on only 2 of 6 relation branches. Revoked accounts remain in recipient pickers; the documented "thread goes read-only on revocation" guarantee does not hold.                                                                                                                                   |

**Suppressed by Audit A's own filter** (recorded because they are real): mock-mode guard (conf 7), CSRF origin check (conf 7), email-queue drain race (conf 7), Host-header open redirect (conf 6), and every LOW — `GITHUB_TOKEN` scope, Sentry PII, contact-error reflection, Drive OAuth scope, no secret scanning, CSP `form-action`, `profiles_self_update` gaps, `mentors_class` PUBLIC execute.

---

## 2. Independent audit findings (Audit B)

Findings I reached by reading the source directly, under the full brief.

| ID   | Sev                  | Location                                                                    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | -------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | MEDIUM               | `src/app/(prt)/login/reset/ResetPasswordForm.tsx:26` → `auth-client.ts:122` | **Password policy is client-side only on the reset path.** `changePasswordSchema` is checked in the browser, then `updatePasswordClient` calls `supabase.auth.updateUser({password})` **directly from the browser to Supabase**. The server never sees the password. The settings path (`settings/actions.ts:45`) validates server-side — the two disagree. The only real floor is the Supabase project's own `PASSWORD_MIN_LENGTH`, which is not in this repo.                                |
| B-02 | **HIGH (composite)** | Supabase project dashboard — not in repo                                    | **A cluster of load-bearing controls is unverifiable from the codebase and must be marked UNKNOWN, not PASS.** See §3.1. Includes leaked-password protection (which `src/lib/validation/user.ts:8-10` _asserts_ is enabled), password minimum length, login brute-force limits, public signup enabled/disabled, OAuth Redirect-URL allowlist, refresh-token rotation + reuse detection, JWT/session expiry, and email-confirmation behaviour.                                                  |
| B-03 | MEDIUM               | `src/lib/security/rate-limit.ts:39-43`                                      | **Spoofable rate-limit key.** `clientIp` returns the **leftmost** `x-forwarded-for` entry — the client-supplied one when a proxy appends rather than replaces — and only falls back to `x-real-ip`. This is the key for both cross-instance limiters (`register`, `contact`), the only defences on unauthenticated endpoints. On Vercel the trusted value is `x-vercel-forwarded-for` / the rightmost entry.                                                                                   |
| B-04 | MEDIUM               | `src/lib/services/contact.ts` + Apps Script deployment                      | **No authentication between the relay and the Apps Script endpoint.** The POST carries no shared secret, signature, or timestamp — only a JSON body. Secrecy of `GOOGLE_SCRIPT_URL` is the entire control. Anyone who learns the URL writes to the Sheet directly, bypassing the honeypot, the Zod schema and the rate limiter, and burns Apps Script quota.                                                                                                                                   |
| B-05 | LOW                  | `src/lib/services/contact.ts:87`                                            | `error: result.error \|\| 'Unknown error'` returns the Apps Script's own error string verbatim to an **unauthenticated** caller. The adjacent `catch` masks correctly; only the non-throwing branch leaks. The single place in the codebase where an upstream error reaches a client.                                                                                                                                                                                                          |
| B-06 | MEDIUM               | `scripts/test-rls.sh:43-45`                                                 | **The RLS test harness cannot test the control it most needs to.** It runs `grant select, insert, update, delete on all tables ... to authenticated` **after** applying the migrations, re-granting table-wide UPDATE on `profiles`, `submissions` and `notifications` — overwriting the column-level grants installed by `0009`/`0033`/`0065`. Those column grants are the _primary_ defence against a student writing `score` or `role`. A regression in them is undetectable by this suite. |
| B-07 | LOW (INFO)           | `supabase/rebuild/0000_full_rebuild.sql`                                    | **The repository cannot prove the production privilege model.** `supabase db dump --schema public` omits role grants, so the snapshot contains only column- and function-level ACLs. Table-level DML for `authenticated` comes from Supabase project defaults not captured anywhere in the repo. This is what makes A-03 and A-07 reachable rather than theoretical — and it means no reviewer can confirm the grant surface from the repo alone.                                              |
| B-08 | LOW                  | `src/lib/permission/class-write.ts:16-25`                                   | **Stale comment inverts a security conclusion.** It states the rebuild snapshot "predates 0043" and that RLS would therefore be _stricter_ than the app guard ("fail-safe, not a hole"). The snapshot's `teaches_class` already contains `or mentors_class(p_class_id)`. The truth is the opposite — RLS is _broader_ than the capability model (A-07).                                                                                                                                        |
| B-09 | LOW                  | `src/app/(prt)/IdleLogout.tsx`                                              | **Idle timeout is a client-side control only.** A stolen token replayed with `curl` never idles out. Combined with the 400-day refresh-token lifetime and `httpOnly: false` (A-05/A-06), there is no server-side session lifetime bound at all.                                                                                                                                                                                                                                                |
| B-10 | LOW                  | `src/lib/auth/binding.ts:11-22`, `src/lib/data/profiles-auth.ts:100-111`    | **The one-time setup code is not a second factor on the Google path.** Password registration requires the hashed code; `bindProfileOnFirstLogin` binds on **email match alone**. Any allowlisted address that is (or can become) a Google identity is claimable without the code. `bindAuthUserIdIfUnbound` also leaves `status` and the code fields untouched, unlike the password path which sets `status='active'` and clears them.                                                         |
| B-11 | LOW                  | `scripts/seed-production-allowlist.mjs:36,43`                               | Seeds `role: 'teacher'` — renamed to `tutor` in `0019`; and `upsert({onConflict:'email'})` with `status:'active'` will silently rewrite an existing production profile's role and status. Bootstrap admin rows are created with **no** setup code, so the admin tier rests entirely on control of that mailbox.                                                                                                                                                                                |
| B-12 | LOW                  | `src/lib/services/attendance/sessions.ts:105-117`                           | `saveSessionFeedback` writes `student_feedback` to a row keyed on `(class_id, session_date)` only — a shared column, via the service-role client. In any class with more than one student, a student overwrites a classmate's feedback and can create session rows for arbitrary dates.                                                                                                                                                                                                        |
| B-13 | INFO                 | `src/app/api/attachments/route.ts:108`                                      | `ownerId` is not UUID-validated before reaching the query; a malformed value surfaces as a logged, non-leaky 500 rather than a 422.                                                                                                                                                                                                                                                                                                                                                            |

---

## 3. Findings identified by BOTH audits

Independent convergence — these are the highest-confidence items in the report.

| Finding                                                                          | Audit A                                    | Audit B                                                                                                     | Corroboration                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Org-settings write open to `sub_admin`; bank details reachable**               | A-01 (two separate finders, HIGH + MEDIUM) | Verified by direct read of `actions.ts:27`, `services/org-settings.ts:46`, and the `org_admin_write` policy | 3 independent confirmations                      |
| **Email/password change with no re-auth and no verification → account takeover** | A-04                                       | B-02 cluster; verified `email_confirm: true` on the admin API at `auth-accounts.ts:45`                      | 3 (auth finder, API finder, me)                  |
| **`tutor_id` field tampering on `class_sessions`**                               | A-11                                       | Verified `sessions.ts:80` against `timetable-slots.ts:57`                                                   | 3 (API finder conf 9, business-logic finder, me) |
| **`sub_admin` reads admin/mentor PII the tier rule forbids editing**             | A-08                                       | Confirmed the read/write asymmetry                                                                          | 3 (DB finder, business-logic finder, sub-agent)  |
| **Apps Script error string reflected to anonymous callers**                      | (LOW, filtered out)                        | B-05                                                                                                        | 2                                                |
| **Mock-mode guard is platform-specific, not environment-specific**               | (conf 7, filtered out)                     | Verified `mock/env.ts:21`                                                                                   | 3 finders raised it; see §6                      |

---

## 4. Findings MISSED by Claude Security

Attributable to the skill's design, not to inattention — it reviews a diff for exploitable code defects and explicitly excludes several of this brief's mandatory sections.

1. **B-02 — the config-dependent control cluster (§3.1).** The single largest gap. The skill reads code; it has no notion of "this control lives in a dashboard the repo cannot see." It therefore cannot mark anything UNKNOWN, and would silently treat `src/lib/validation/user.ts:8-10`'s claim about leaked-password protection as fact.
2. **B-01 — password policy enforced only in the browser on the reset path.** Excluded by precedent #8 ("a lack of validation in client-side code is not a vulnerability, the backend handles it") — but here **there is no backend**: the browser talks to Supabase directly.
3. **B-03 — spoofable rate-limit key.** Hard-excluded ("rate limiting concerns").
4. **B-04 — Apps Script endpoint has no authentication.** Section 32 of this brief is a first-class requirement; the skill has no equivalent, and the Apps Script itself is outside the repo.
5. **B-06 / B-07 — the test harness and snapshot cannot verify the privilege model.** Test-only files are hard-excluded, and "no test coverage for a control" is not a vulnerability class the skill recognises.
6. **B-08 — a stale comment that inverts a security conclusion.** Documentation findings are hard-excluded.
7. **B-09 — client-side-only idle timeout.** Reads as a hardening gap, not a concrete exploit.
8. **B-10 / B-11 — setup-code bypass on the OAuth path; broken bootstrap script.** Neither is a code defect on a reachable request path.
9. **Backups & recovery (§34) — entirely unassessed.** Nothing in the repo speaks to Supabase PITR, backup retention, encryption, or restore testing. Marked UNKNOWN.
10. **Dependency posture as a positive signal.** `npm audit` = 0 findings across 762 packages, all resolved from `registry.npmjs.org`, lockfile committed, 4 install-script packages all first-party. The skill excludes dependency findings in both directions.

---

## 5. Findings MISSED by the independent audit

Audit A's parallel finders had more time on the deep call graph than I did, and reached several things I did not.

1. **A-03 — `replace_own_submission` bypasses the hard deadline.** I confirmed the RPC was `authenticated`-granted and correctly self-authorizing on _identity_, and moved on. I did not check it against `enforce_deadline`, added later in `0035`. This is the sharpest finding in the report: a documented business rule with **zero** database enforcement and two open PostgREST paths.
2. **A-09 — `canManageClass` is override-blind.** I read `capabilities/index.ts` and judged the resolution model correct, but did not trace which call sites use `getBaseCapabilities` versus the resolved set. A deny override that appears to take effect and doesn't is precisely the false-confidence class this brief asks for.
3. **A-10 — student-scoped mentor persona elevates document rights.** I read `documents.ts` and confirmed the matrix and the `'own'` rule; I missed that `hasMentorAuthority` is `hasAnyPersona` (any scope), so `documentRoleFor` returns `'mentor'` before the `isTutor` branch.
4. **A-12 — the `.or()` escaper inconsistency.** I searched for raw SQL and dynamic `ORDER BY` and found none. I did not diff the two escape helpers across their call sites.
5. **A-14 — resource attachment authorized as `upload` instead of `edit`.** I read `assertMayAttach` and judged the submission branch; I noted the missing grading-state check but not that the resource branch bypasses the tutor `'own'` rule.
6. **A-15 — revoked accounts stay messageable.** Not on my path at all until the DB finder surfaced it.
7. **A-05 / A-06 — the `@supabase/ssr` cookie defaults.** I read the app's cookie handling and saw the options passed straight through; I did not open `node_modules` to read what those defaults actually are. Verifying a third-party default rather than assuming it is exactly the discipline this brief demands, and I failed it until prompted.
8. **A-13 — `entity_tags` RLS dropped without the promised replacement.** Requires reading a migration's stated intent against the service layer that was supposed to implement it.

---

## 6. Conflicting assessments

| #   | Subject                                            | Position 1                                                                                                                                                                  | Position 2                                                                                                                                                                                              | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Mock mode in production**                        | DB finder, verified control #10: _"Mock mode cannot activate in production — `isMock()` returns `false` whenever `VERCEL === '1'`."_ API finder concurred as a non-finding. | Auth finder (MEDIUM) and config finder (LOW): the guard is **platform**-specific; any non-Vercel host re-enables a full auth bypass via the unsigned `mock_uid` cookie and the public `/api/dev/login`. | **Position 2.** Verified `src/lib/mock/env.ts:21`: the only check is `process.env.VERCEL === '1'`. There is no `NODE_ENV === 'production'` test anywhere in the gate. Correct for the current target, fragile as a security control. Docker/self-hosted/another PaaS, or Vercel with system env vars not exposed, all re-open it. **Rated MEDIUM.** One-line fix: add `if (process.env.NODE_ENV === 'production') return false`. |
| 2   | **Revoked-account messaging (A-15)**               | DB finder: MEDIUM.                                                                                                                                                          | Mine: the revoked user cannot _read_ while revoked — `requireActiveProfile` bounces them to `/access-revoked`. Exposure is deferred to restore.                                                         | **LOW–MEDIUM.** I verified the four unfiltered branches in `recipient-policy-resolver.ts` and that none of `selectActiveTutorIdsByClassIds` / `selectActiveEnrollmentPairsBy*` / `selectActiveTutorPairsByClassIds` filters `profiles.status`. Real, and the documented invariant is false — but no live data exposure. **Rated LOW.**                                                                                           |
| 3   | **`/api/attachments/[id]/download` authorization** | Sub-agent: LOW, "no app-layer check at all — verify in prod."                                                                                                               | API finder: non-finding — RLS `attachments_read` is a deliberate, documented single source of truth, reached via the request-scoped (not service-role) client.                                          | **Non-finding**, with the sub-agent's caveat retained: it is the one download surface with **no** app-layer authorization, so it fails open if migrations `0057`–`0062` are not applied. Confirm before go-live.                                                                                                                                                                                                                 |
| 4   | **`teaches_class` / snapshot drift**               | `class-write.ts:16-25`: snapshot predates `0043`, so RLS is _stricter_ than the app guard.                                                                                  | DB finder A-07: RLS is _broader_ — mentors get full class write.                                                                                                                                        | **The comment is wrong (B-08).** I read the snapshot's `teaches_class` directly: it ends `or mentors_class(p_class_id)`. The comment describes a fail-safe; the reality is a privilege the capability model denies.                                                                                                                                                                                                              |
| 5   | **Stored XSS via inline attachment download**      | Plausible on inspection — `Content-Disposition: inline` with a stored `mime_type`.                                                                                          | Rejected.                                                                                                                                                                                               | **Not a vulnerability.** `EXTENSION_MIME` (`attachments/validation.ts:19-31`) is a closed allowlist with no `text/html` and no `image/svg+xml`, cross-checked against extension _and_ magic bytes. `nosniff` is global and the portal CSP has no `unsafe-inline`. Three independent layers.                                                                                                                                      |

---

## 7. Consolidated final security assessment

### 7.1 Verdict

**This is a well-built application.** The architecture is deliberate and the security reasoning is written down in the code — fail-closed persona reads, constant-time cron comparison, exact-match public-path allowlisting, uniform registration errors, CSV formula-injection guards, atomic void/issue, advisory-locked last-admin protection, a genuinely layered upload validator, and a nonce-based CSP with no `unsafe-inline`. `npm audit` is clean. **No secret has ever been committed** — verified by filename and content pickaxe across all 397 commits and 8 branches — so **no rotation is required**.

The defects cluster in two coherent places, and neither is carelessness:

1. **The service-role architecture concentrates all authorization in application code** (ADR-0005). 172 service-role calls bypass RLS. That is a defensible design, but it means _every_ service function is load-bearing, and the failures are exactly where an app-layer gate is looser than the DB policy it bypasses (A-01, A-08) or where two authority models drift apart (A-07, A-09, A-10).
2. **Rules that live only in TypeScript are not enforced at the trust boundary.** The browser holds a live session and the publishable key, so PostgREST is a first-class attack surface — as the codebase itself argues in `0009` and `0028`. `enforce_deadline` (A-03) and the drive-link allowlist never made the same journey those two migrations made.

**Not production-ready as-is.** Three HIGHs plus the unverified auth-configuration cluster must close first. Everything else is a short, well-scoped list.

### 7.2 Severity roll-up

| Severity | Count            | Items                                                                                                                       |
| -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | 0                | —                                                                                                                           |
| **HIGH** | 3 (+1 composite) | A-01, A-02, A-03; **B-02** (UNKNOWN cluster — HIGH until verified)                                                          |
| MEDIUM   | 15               | A-04…A-15, B-01, B-03, B-04, B-06                                                                                           |
| LOW      | 12               | B-05, B-07…B-12, CI token scope, Sentry PII, CSP `form-action`, `mentors_class` PUBLIC execute, `profiles_self_update` gaps |
| INFO     | 2                | B-13, dead service-role surface                                                                                             |

### 7.3 Fix order

**Before production (blocking):**

1. **A-01** — gate org settings on `manageAdminTier`, and add `requireAdminPersona` inside `saveOrgProfile`. _One-line + one-line. Financial redirection risk._
2. **A-03 + A-02** — put `enforce_deadline` in the database: raise inside `replace_own_submission`, tighten `submissions_insert`'s `WITH CHECK`, and add the graded/active/deadline predicate to `assertMayAttach`. Factor one `assertSubmissionOpen()` used by all three writers.
3. **B-02** — walk §3.1 against the live Supabase project and record the result in `docs/security-operations.md`.
4. **A-04** — require the current password before an email or password change; drop `email_confirm: true` for user-initiated changes; revoke other sessions after either.
5. **A-05** — pass `cookieOptions: { secure: true }` to both `createServerClient` calls; add `preload` to HSTS.

**Next (same sprint):** 6. **A-07** — split `teaches_class()` into a read helper and a write helper so RLS matches the mentor capability baseline. 7. **A-09 / A-10** — make `isClassAdmin` override-aware; make `documentRoleFor` prefer the _higher_ of tutor/mentor per class scope rather than short-circuiting on any mentor persona. 8. **A-08** — reuse `canManageTarget` on the read path in `admin/users/[id]/page.tsx`. 9. **A-11 / B-12** — promote `assertClassTutor` into `lib/permission/class.ts` and call it from `saveSessionTimes`; key `student_feedback` on `(class_id, session_date, student_id)`. 10. **A-12** — swap `escapeIlike` → `escapeOrIlike` at `resources.ts:79,116`. 11. **A-14** — authorize resource attachment as `'edit'`; snapshot into `resource_versions`; audit it. 12. **B-01** — route password reset through a server action so `changePasswordSchema` is authoritative on both paths. 13. **B-03** — read `x-vercel-forwarded-for` (or the rightmost XFF entry) in `clientIp`. 14. **B-06** — move the harness `grant` block **before** the migration loop so the column-grant boundary becomes testable.

**Backlog:** A-06 (document as accepted risk; shorten refresh-token lifetime, enable rotation + reuse detection), A-13, A-15, B-04 (shared secret + timestamp between relay and Apps Script), B-05, B-08…B-11, `permissions: contents: read` in CI, Sentry `beforeSend` scrubber, `form-action 'self'`, `gitleaks` in the pre-commit hook and CI.

---

## 3.1 Controls that CANNOT be verified from this repository — UNKNOWN, not PASS

Per the brief's verification principle. Each is enforced in the Supabase project dashboard; none is in the repo, in IaC, or in `docs/`.

| Control                                  | Why it matters here                                                                                                                                                        | Status      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Leaked-password protection               | `src/lib/validation/user.ts:8-10` **asserts** it is "enabled in the project's Auth settings". Nothing verifies that claim.                                                 | **UNKNOWN** |
| Password minimum length / complexity     | The reset path never touches the server (B-01), so this is the _only_ real floor on that path.                                                                             | **UNKNOWN** |
| Login brute-force / auth rate limits     | Sign-in is browser→Supabase; none of the app's limiters apply.                                                                                                             | **UNKNOWN** |
| Public signup enabled?                   | If on, anyone can mint auth users at will. They get no profile (so no access), but it is uncontrolled growth and a future foothold.                                        | **UNKNOWN** |
| OAuth Redirect-URL allowlist             | The app's `redirectTo` is built from `window.location.origin`, but an attacker can call Supabase's authorize endpoint directly. The project allowlist is the only control. | **UNKNOWN** |
| Refresh-token rotation + reuse detection | Directly determines the blast radius of A-06 (JS-readable 400-day refresh token).                                                                                          | **UNKNOWN** |
| JWT / session expiry                     | With B-09 (client-only idle logout), this is the sole server-side session bound.                                                                                           | **UNKNOWN** |
| Session revocation on password change    | No app code revokes other sessions; behaviour depends on GoTrue configuration.                                                                                             | **UNKNOWN** |
| Custom SMTP configured                   | `docs/deployment.md:19` warns the built-in sender is non-production and will silently drop resets at scale.                                                                | **UNKNOWN** |
| Migrations `0057`–`0062` applied         | `/api/attachments/[id]/download` has **no** app-layer authorization — it fails open if `attachments_read` is absent (see §6 #3).                                           | **UNKNOWN** |
| Apps Script Web App access setting       | "Anyone" + "execute as owner" makes the URL a world-writable Sheet endpoint (B-04). Not in this repo.                                                                      | **UNKNOWN** |
| Table-level grants for `authenticated`   | Snapshot omits role grants (B-07). Determines reachability of A-03 and A-07.                                                                                               | **UNKNOWN** |
| Backups / PITR / restore testing         | §34 of the brief. Nothing in the repo addresses it.                                                                                                                        | **UNKNOWN** |

---

## 8. Route inventory (§36)

29 route handlers, enumerated mechanically and cross-checked by hand. `rl` = rate-limited.

| Route                                                                   | Methods               | Auth                                                                            | Authorization                                       | rl        | Validation                           | Risk                 |
| ----------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- | --------- | ------------------------------------ | -------------------- |
| `/api/assignments`                                                      | POST                  | `requireCapabilityApi('manageClassContent')`                                    | `canManageClass`                                    | —         | zod                                  | Low                  |
| `/api/attachments`                                                      | POST                  | `requireActiveProfileApi`                                                       | `assertMayAttach` per owner                         | ✔         | ext+MIME+magic, 25 MB                | **A-02, A-14**       |
| `/api/attachments/[id]/download`                                        | GET                   | `requireCapabilityApi('viewClasses')`                                           | **RLS only** (`attachments_read`)                   | ✔         | `.eq()` param                        | §6 #3                |
| `/api/calendar`                                                         | GET                   | `requireCapabilityApi('viewCalendar')`                                          | RLS-scoped                                          | —         | regex + ≤400d                        | Low                  |
| `/api/contact`                                                          | POST                  | **public (by design)**                                                          | n/a                                                 | ✔ shared  | zod + honeypot                       | **B-03, B-04, B-05** |
| `/api/cron/{drain-emails,keepalive,queue-health,reconcile-attachments}` | GET                   | `CRON_SECRET`, `timingSafeEqual`, fail-closed                                   | n/a                                                 | —         | n/a                                  | Low                  |
| `/api/dev/login`, `/api/dev/logout`                                     | POST/GET              | 404 unless `isMock()`                                                           | mock creds                                          | —         | coerced                              | §6 #1                |
| `/api/events`                                                           | GET/POST              | `listHandler('viewCalendar')` / `createHandler('manageCalendar')`               | `canWriteClass` + `assertClassActive`               | —         | zod (`from`/`to` unvalidated on GET) | Low                  |
| `/api/events/[id]`                                                      | PATCH/DELETE          | `updateHandler`/`deleteHandler('manageCalendar')`                               | `canWriteClass` on stored **and** destination class | —         | zod                                  | Low                  |
| `/api/health`                                                           | GET                   | **public (by design)**                                                          | n/a                                                 | 30 s memo | n/a                                  | Low                  |
| `/api/logout`                                                           | POST                  | self                                                                            | n/a                                                 | —         | n/a                                  | Low                  |
| `/api/payslips`, `/api/receipts`                                        | POST                  | `requireRoleApi(['admin'])`                                                     | `manageAdminTier` (hard capability)                 | ✔         | `issueDocSchema`                     | Low                  |
| `…/[id]/pdf`                                                            | GET                   | `requireActiveProfileApi`                                                       | `viewFinance` **or** `party_id === viewer.id`       | —         | uuid                                 | Low                  |
| `…/[id]/void`                                                           | POST                  | `requireRoleApi(['admin'])`                                                     | `manageAdminTier`; atomic CAS                       | ✔         | uuid                                 | Low                  |
| `…/export`                                                              | GET                   | `requireCapabilityApi('viewFinance')`                                           | capability                                          | —         | CSV formula guard                    | Low                  |
| `/api/report-card/[studentId]/pdf`                                      | GET                   | `assertActiveProfile`                                                           | `canViewReportCard`                                 | ✔         | non-student rejected                 | Low                  |
| `/api/reports/[type]/[studentId]`                                       | GET                   | `assertActiveProfile`                                                           | `canViewReportCard`                                 | ✔         | type allowlist; HTML escaped         | Low                  |
| `/api/resources/[id]/download`                                          | GET                   | `requireCapabilityApi('viewClasses')`                                           | `canDocument('download')`                           | ✔         | Drive host re-checked at redirect    | Low                  |
| `/api/timetable`, `/api/timetable/[id]`                                 | GET/POST/PATCH/DELETE | `listHandler`/`createHandler`/`updateHandler`/`deleteHandler('manageCalendar')` | `canWriteClass` + `assertClassTutor`                | —         | zod                                  | Low                  |
| `/auth/callback`                                                        | GET                   | public (by design)                                                              | binding refuses to re-point a claimed row           | —         | `safeNext` blocks off-origin         | Low                  |

Server actions: 24 `'use server'` files; every exported action calls a guard as its first statement. CSRF is covered by Next 16's built-in Origin/Host check for actions — **but the 15 state-changing route handlers have no origin assertion** and rely on `SameSite=Lax`, which does not separate `certedacademia.com` from `app.certedacademia.com` (same site). The marketing host retains `unsafe-inline`. Add a `Sec-Fetch-Site`/`Origin` check to the four factories in `lib/api/route-handlers.ts` plus the hand-written `attachments`/`logout` POSTs.

---

## 9. False-confidence analysis (§39)

Controls that look effective and are not.

| Control                                      | Appearance                                                                                             | Reality                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability **deny** override                 | Admin UI writes an audited `deny`; nav and lifecycle actions lock.                                     | `canManageClass` reads the persona **baseline** — grading, attendance, enrolment and document writes survive. **A-09**                                  |
| Mentor = "oversight, not teaching"           | Capability baseline grants the mentor no write capability at all.                                      | RLS `teaches_class()` gives them tutor-level INSERT/UPDATE/**DELETE** on eight class-scoped tables. **A-07**                                            |
| Tutor may only edit **own** documents        | `DOCUMENT_PERMISSION_MATRIX` says `edit: 'own'`.                                                       | A pastoral mentor assignment flips the role to `'mentor'` (`edit: 'yes'`); and the attachment route authorizes `'upload'`, not `'edit'`. **A-10, A-14** |
| Hard assignment deadline                     | Per-assignment `enforce_deadline` flag; UI shows "closed".                                             | Enforced in one TypeScript function. Two open PostgREST paths and the attachment route ignore it. **A-03, A-02**                                        |
| One-time setup code                          | SHA-256 hashed, 7-day TTL, single-use, uniform errors.                                                 | Not required at all on the Google OAuth path — email match alone claims the profile. **B-10**                                                           |
| Password complexity policy                   | Uppercase + lowercase + digit + symbol, ≥ 8, rejects the email local-part.                             | On the reset path the check runs **in the browser** and the password goes straight to Supabase. **B-01**                                                |
| 30-minute idle logout                        | "The portal shows financial documents and PII, so an unattended session shouldn't stay open."          | `localStorage` + a `setInterval` in one React component. Invisible to any non-browser client. **B-09**                                                  |
| Session cookie hardening                     | `sameSite: 'lax'` set; the mock cookie explicitly sets `httpOnly: true`.                               | The **real** session cookie has no `Secure` and `httpOnly: false` — inherited defaults, never overridden. **A-05, A-06**                                |
| "Thread goes read-only on revocation"        | Stated as an invariant in `messaging/policies.ts:17-23`.                                               | Implemented on 2 of 6 relation branches. **A-15**                                                                                                       |
| RLS test suite                               | Runs real Postgres, asserts per-persona visibility, gates CI.                                          | Re-grants table-wide DML **after** the migrations, erasing the column-grant boundary it most needs to protect. **B-06**                                 |
| `entity_tags` locked down                    | Migration `0055` drops the open policy "because reads now go through the server-side domain".          | The domain check was never written. Safe only by accident of the two current callers. **A-13**                                                          |
| Mock mode is production-safe                 | Guard present, `/api/dev/login` 404s, comment says it "must NEVER activate on a deployed environment". | The guard tests `VERCEL === '1'`, not `NODE_ENV`. **§6 #1**                                                                                             |
| Rate limiting on public endpoints            | Cross-instance, Postgres-backed, degrades rather than disables.                                        | Keyed on the leftmost — client-supplied — `x-forwarded-for` entry. **B-03**                                                                             |
| Errors are masked                            | `apiError` maps unknown errors to a generic 500 and logs the detail.                                   | `/api/contact` returns the upstream Apps Script error verbatim to anonymous callers. **B-05**                                                           |
| The rebuild snapshot is the schema of record | Byte-accurate, freshness-checked in CI, pre-push hook.                                                 | Contains no role grants — the production privilege surface is invisible to it. **B-07**                                                                 |

---

## 10. Security test cases (§37)

Run against an authorized staging environment only.

| #   | Test                                                                                                     | Expected (post-fix)                             |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | Unauthenticated `GET` on every `/api/*` route                                                            | 401 JSON envelope (page routes: 307 → `/login`) |
| 2   | Student session → `POST /api/assignments`                                                                | 403 `forbidden`                                 |
| 3   | Student → `GET /api/report-card/<other-student>/pdf`                                                     | 404 (indistinguishable from missing)            |
| 4   | Tutor → `GET /api/payslips/<other-tutor's-id>/pdf`                                                       | 404                                             |
| 5   | **A-01:** sub_admin → `saveOrgProfileAction` with `bank_account`                                         | 403                                             |
| 6   | **A-02:** student → `POST /api/attachments` (`owner=submission`) on a graded / past-deadline submission  | 422                                             |
| 7   | **A-03:** student → `POST /rest/v1/rpc/replace_own_submission` after a hard deadline                     | `deadline_passed`                               |
| 8   | **A-03b:** student → direct `POST /rest/v1/submissions` after a hard deadline                            | RLS `WITH CHECK` violation                      |
| 9   | **A-07:** mentor → `DELETE /rest/v1/attendance?class_id=eq.<mentee class>`                               | 0 rows / denied                                 |
| 10  | **A-09:** sub_admin with `deny manageClasses` → grade a submission                                       | 403                                             |
| 11  | **A-10:** tutor-who-mentors → `assertCanDocument('edit')` on a colleague's document                      | PermissionError                                 |
| 12  | **A-11:** tutor → `saveSessionAction` with a foreign `tutor_id`                                          | ValidationError                                 |
| 13  | **A-12:** `GET /documents?q=zzz,id.not.is.null` and `?q=)`                                               | Literal search; no 500                          |
| 14  | **Mass assignment:** `editUserAction` with `role=admin`, `status=active`                                 | Stripped by zod; role unchanged                 |
| 15  | **Self-promotion:** student → `PATCH /rest/v1/profiles?id=eq.<self>` with `role`, `class_level`, `score` | Denied at the column-grant layer                |
| 16  | **Self-grading:** student → `PATCH /rest/v1/submissions?id=eq.<own>` with `score`                        | Denied at the column-grant layer                |
| 17  | **A-04:** change email/password without the current password                                             | 403 / re-auth challenge                         |
| 18  | **A-04b:** after a password change, replay an older session cookie                                       | 401                                             |
| 19  | **Account enumeration:** register/login/forgot with known vs unknown emails                              | Identical body, status, and timing              |
| 20  | **B-01:** call `supabase.auth.updateUser({password:'a'})` with a recovery token                          | Rejected by the project policy                  |
| 21  | **B-03:** `POST /api/contact` ×20 rotating `X-Forwarded-For`                                             | 429 after 5                                     |
| 22  | **Upload bypass:** `.pdf` containing HTML; `.pdf.exe`; `../../x.pdf`; 30 MB file                         | 422 on each                                     |
| 23  | **CSRF:** cross-origin `POST /api/receipts/<id>/void` with credentials                                   | Rejected on `Sec-Fetch-Site`                    |
| 24  | **Open redirect:** `Host: localhost.evil.com` → `GET /dashboard`; `/auth/callback?next=//evil.com`       | Same-origin `Location`                          |
| 25  | **Cache leakage:** fetch a report card as A, then as B via a shared proxy                                | `private, no-store`; no cross-user hit          |
| 26  | **Mock bypass:** set `Cookie: mock_uid=<uuid>` against production                                        | Ignored                                         |
| 27  | **Cron forgery:** `/api/cron/drain-emails` with no / wrong bearer                                        | 401                                             |
| 28  | **Race:** two concurrent `POST /api/receipts/<id>/void`                                                  | One 200, one 404                                |
| 29  | **Race:** two concurrent registrations on one setup code                                                 | One success, one rejection, no orphan auth user |
| 30  | **Pagination:** `/admin/users?limit=100000`                                                              | Server-side cap honoured                        |

---

## Appendix — verified-correct controls (abridged)

Recorded so they are not re-litigated. **Secrets:** never committed (filename + content pickaxe over 397 commits, 8 branches); `.env.local` holds only mock sentinels; `SUPABASE_SECRET_KEY` reachable only through `server-only` modules; client bundle scanned empirically (120 chunks) — zero secret names, zero secret-shaped literals, only the two genuinely-public `NEXT_PUBLIC_` values; no source maps in `.next/static`. **XSS:** zero `dangerouslySetInnerHTML` / `innerHTML` / `eval` / `srcdoc` in `src/`; every URL sink passes `linkUrl` (http/https only); all PDF/report templates escape `& < > " '` on every interpolation. **Uploads:** extension allowlist × MIME cross-check × magic bytes × filename sanitisation × 25 MB cap, re-run server-side. **Drive:** no `permissions.create` anywhere — nothing is ever made link-public; query strings escaped. **PDF:** unmodified `chromium.args`, all assets inlined, no outbound fetch. **Finance:** issue/void structurally admin-locked at transport _and_ service; `manageAdminTier` is a hard capability; void is an atomic CAS; totals recomputed server-side; issuance RPCs `service_role`-only. **Grading:** students hold no column grant on `score`/`graded_at`; `0028` narrows the UPDATE `USING` clause; grading authorizes against the submission's own assignment. **Registration:** hashed single-use codes, atomic conditional bind, orphan cleanup on a lost race, uniform errors. **Cron:** all four fail closed with length-checked `timingSafeEqual`. **DB:** RLS enabled on 37/37 tables, zero `USING (true)`, no ownership spoofing on any INSERT policy, 24/24 `SECURITY DEFINER` functions pin `search_path`, anonymous access fully closed. **Caching:** portal is `force-dynamic`; every data-bearing API response is `private, no-store`; the finance ETag authorizes before any 304. **Headers:** full set incl. HSTS, `nosniff`, `frame-ancestors 'none'`, COOP, CORP on `/api/*`; nonce-based CSP with no `unsafe-inline`/`unsafe-eval` in production. **CORS:** none configured — same-origin default. **CI:** `pull_request` (not `pull_request_target`), zero `secrets.*` references, first-party actions only. **Dependencies:** `npm audit` clean across 762 packages; lockfile committed; all resolved from `registry.npmjs.org`.
