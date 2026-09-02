# Production Security Re-Audit (Round 5) — Cert-Ed Academia

**Date:** 2026-09-02
**Target:** `feature/cert-ed-academia-app` — HEAD `11f92f1`
**Prior rounds:** [08-20](./2026-08-20-security-audit.md) `2bda9c0` · [08-25](./2026-08-25-security-reaudit.md) `4ab16dd` · [08-25 r3](./2026-08-25-security-reaudit-round3.md) `5e23697` · [08-26 r4](./2026-08-26-security-reaudit-round4.md) `fa11762`
**Delta:** 9 commits · migrations `0082`–`0089` · new features: assigned reminders, teaching hours, mentor session-time editing, guardian consent, profile erasure
**Build state verified by me:** `vitest run` → **1265 passed / 166 files** (up from 1179/157).

---

## 1. Twelve findings closed — including both round-4 blockers

| ID                    | Verdict                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-01** ordering     | **FIXED** — all three sub-problems | Epilogue now at `:4417-4425`, _before_ the first column GRANT at `:4426`. `rebuild-snapshot.sh:48-96` **generates** it and splices it before the ACL marker, failing hard if none exists. `snapshot-privilege-epilogue.test.ts` now asserts _"orders each table REVOKE before every column GRANT on that table."_ A new `scripts/test-privilege-parity.sh` diffs chain-provisioned vs snapshot-provisioned ACLs in CI — **3427 privilege rows compared, OK**. |
| **V-01**              | **FIXED**                          | `requireManageable` now uses `canWriteClass` (tutor-only, mirroring `teaches_class_write`). The service-role RPC is retained but correctly gated. The comment names V-01 and the reasoning.                                                                                                                                                                                                                                                                   |
| **V-02 / V-03**       | **FIXED**                          | All four `FOR ALL` policies split by verb. DELETE is now `teaches_class_write` on calendar/timetable and **admin-only** on attendance/`class_sessions`. Mentors hold no DELETE on any of the four. `calendar_events_insert` additionally pins `created_by = current_profile_id()`.                                                                                                                                                                            |
| **A-09**              | **FIXED**                          | `class.ts:33-52` now resolves overrides itself via `resolveCapabilities`. A `deny manageClasses` genuinely stops `canManageClass`.                                                                                                                                                                                                                                                                                                                            |
| **A-10**              | **FIXED**                          | `documentRoleFor` now tests `isTutor` **before** `isMentor`, and the mentor branch keys on the global-scope `isMentor` rather than `hasMentorAuthority`. The `edit:'own'` → `edit:'yes'` upgrade is gone.                                                                                                                                                                                                                                                     |
| **N-10**              | **FIXED**                          | `hasScopedPersona` now pins `scope_type === 'student'`, matching the DB's `mentors_student`.                                                                                                                                                                                                                                                                                                                                                                  |
| **V-06**              | **FIXED**                          | `isSanctionedMockContext()` inverts the logic — fails closed in any production-like context unless positively sanctioned. The comment names the self-hosted `next start` gap.                                                                                                                                                                                                                                                                                 |
| **V-07**              | **FIXED**                          | 26 monitored + 14 explicitly exempted (each with a written reason) = the exact 40 live RLS tables. `rls-required-parity.test.ts` makes a silent gap impossible. `receipt_lines`/`payslip_lines` included.                                                                                                                                                                                                                                                     |
| **V-08**              | **FIXED**                          | Parity test now binds `next.config.js`'s copy to `MOCK_ONLY_ENV_VARS`.                                                                                                                                                                                                                                                                                                                                                                                        |
| **V-05**              | **FIXED at the named site**        | `DriveLink` routes through `safeExternalHref`.                                                                                                                                                                                                                                                                                                                                                                                                                |
| **CSP `form-action`** | **FIXED**                          | `'self'` added, with the previous (incorrect) rationale explicitly retracted — `form-action` governs submission targets, not redirects.                                                                                                                                                                                                                                                                                                                       |
| **CI token**          | **FIXED**                          | `permissions: contents: read` at workflow level.                                                                                                                                                                                                                                                                                                                                                                                                              |

**A-04 — major progress.** Password change _and_ password reset now revoke sibling sessions; admin revoke calls `setAuthUserBanned` so GoTrue refuses refresh and sign-in (verified wired at `admin-lifecycle.ts:159`, unban at `:194`). That is real work on a finding open since round 1.

---

## 2. The three HIGHs — and why they rhyme

All three are the same defect: **a control enforced only in application code, while the database policy behind it is broader — on an architecture where the browser holds the publishable key and a user JWT, so PostgREST is directly reachable.** The codebase's own migrations `0009`, `0028` and `0067` argue against exactly this. Two of the three were _created by_ fixes to my earlier findings.

### W-01 — The mentee-notes minimisation is bypassable, and the comment says otherwise

**HIGH.** `src/lib/services/mentee-notes.ts:23-33`

The N-03 fix filters notes to the mentor's own tenure. Its comment states:

> _"Enforced here because the read is service-role gated by this service, so this IS the operative boundary."_

It is not. The live policy is `mentee_notes_read USING (is_active_admin() OR mentors_student(student_id))` — **no author predicate, no time predicate** — and `mentee_notes` has **no column grants**, so it inherits Supabase's default table-wide `GRANT ALL` to `authenticated`. Audit A demonstrated the read empirically against a provisioned schema: a mentor assigned 10 days ago retrieved a prior mentor's note authored 400 days earlier.

A currently-assigned mentor issues `GET /rest/v1/mentee_notes?student_id=eq.<uuid>` with the publishable key and their own token, and receives the complete pastoral history about a minor — precisely what N-03 was raised to prevent. **Fix:** move the tenure/author predicate into the RLS policy, and correct the comment.

### W-02 — The guardian-consent gate is bypassable via Google sign-in

**HIGH.** `src/app/(prt)/auth/callback/route.ts:24-33`

`requiresGuardianConsent` is **module-private** to `registration.ts:37` and never consulted in the OAuth callback. A minor blocked on the password path — _"A parent or guardian must consent before a student under 18 can set up their account"_ — is fully activated by clicking Sign in with Google, and the consent row is written with `guardian_consent: false`. The system's own append-only log documents the gap on an active minor account.

**The causality matters:** the callback now _activates_ pending invites. That is the B-10 fix I asked for in round 3 (it closed a denial-of-account bug), and activating is exactly what opened this. **Fix:** export `requiresGuardianConsent` and gate the shared bind path, so one implementation covers both flows.

### W-03 — The assigned-reminders guard short-circuits on the wrong row

**HIGH.** `supabase/migrations/0086_assigned_reminders.sql`

```sql
if new.created_by = new.user_id then
  return new; -- personal reminder: owner has full control
end if;
...
or new.created_by is distinct from old.created_by
or new.user_id is distinct from old.user_id then
  raise exception 'assignee may only mark an assigned reminder done';
```

The ownership test reads **NEW**; the immutability checks for those same columns come _after_ it. An assignee who sets `created_by` to their own id in the same `PATCH` makes the first condition true and returns before any check runs. And `reminders` has no column grants and no epilogue entry — table-wide `ALL` to `authenticated` — so the trigger is the only gate, and `created_by` is directly writable.

A student rewrites or deletes a reminder a tutor assigned them; the tutor's list silently loses the row. Every stated control ("no edit, no reopen, never the assignee") is void. **Fix:** test `OLD` for ownership and check immutability first; then `revoke all on table public.reminders from authenticated` plus explicit column grants, matching the pattern already used for `profiles`, `submissions` and `class_sessions`.

---

## 3. Other new findings

**W-04 (MEDIUM) — `reminders_insert` has no enrolment tie.** The policy requires `teaches_class(class_id)` but never relates `user_id` to `class_id`. The service enforces enrolment (`reminders.ts:160`); PostgREST does not. A tutor can post a reminder to **any** profile — including the super-admin's — with attacker-chosen title and description rendered on that user's dashboard, and the target cannot delete it (`reminders_delete` is creator-only).

**W-05 (MEDIUM) — the V-01 defect survives at a site the fix didn't reach.** `insertVersion` (`data/resource-versions.ts:82`) uses `createAdminClient()` while its gate is `canDocument` → `canManageClass`, which admits mentors. The `resources` write itself is refused by RLS (0 rows, silently), but the `resource_versions` snapshot succeeds under the service role — on a table with a read policy and **no write policy at all**. Same shape as V-01: a service-role write behind a mentor-admitting gate.

> **RESOLVED (2026-09-02) — tutor-only content authoring.** The root cause was the document permission matrix granting the mentor row full write control, out of step with the capability model (a mentor holds no `manageClassContent`). The mentor row is now read-only oversight — `{ view:'yes', upload:'no', edit:'no', delete:'no', download:'yes', share:'no' }` (`permission/documents.ts`) — so `canDocument`'s `entry === 'no'` short-circuit refuses every authoring path, `insertVersion` included. A mentor who also teaches still writes through their separate tutor persona. No migration was needed: `resource_versions` already has RLS enabled with **no write policy**, so the direct-PostgREST vector was already deny-by-default; the service-role write is now the only path and it is gated tutor-only. Decision recorded against a parallel session that had documented the opposite (mentors-allowed); the user chose tutor-only.

**W-06 (MEDIUM) — erasure leaves third-party PII.** `eraseUser` anonymises the profile and deletes mentee notes, but deliberately keeps the `profiles` row so audit/finance FKs survive — which means the `ON DELETE CASCADE` on `guardians` never fires. A parent's name, phone, email and relationship remain in full after an erasure the academy will report as complete. `class_sessions.student_feedback` is likewise untouched.

**W-07 (LOW) — the personal teaching-hours tile doesn't filter by tutor.** `getTutorPersonalHours` sums every session in the tutor's classes without a `tutor_id` predicate, contradicting the module's own isolation invariant. Co-taught classes leak a colleague's hours into your own total.

**W-08 (LOW) — the new mentor session-time writes skip two sibling guards:** no `isCalendarDate` validation and no `assertClassActive`, so an archived class's historical hours can be rewritten.

**W-09 (LOW) — `entity_tags` service-role writes** are gated on the mentor-admitting `canManageClass`. Same shape as W-05, lower impact.

> **RESOLVED (2026-09-02) — tutor-only tag authoring.** `assertCanTagEntity` (`services/tags.ts`) now gates a class tag on `canWriteClass` (tutor-of-class or admin, mirroring `teaches_class_write`) instead of `canManageClass`, and a resource tag through `assertCanDocument(actor,'edit',doc)` — which the W-05 matrix change now refuses for mentors. No migration needed: `entity_tags` has RLS enabled with **no policy at all**, so direct authenticated writes are already denied and the service-role write is the only path, now tutor-only.

**W-10 (LOW) — V-04 is 4 of 6.** `is_http_link()` now constrains `submissions`, `resources`, `resource_versions` and `assignments`. `meet_links.url` and `notifications.link` have **zero** check constraints — and `meet_links.url` is also the one link column whose render site still emits a raw `<a href>`. React 19 blocks `javascript:` at the DOM layer, so this is phishing/open-redirect rather than stored XSS.

---

## 4. Still open

| ID                                     | Sev      | Note                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-04**                               | **HIGH** | Password path improved; **the email path is untouched**. `changeOwnEmail` has no revocation (`signOutOwnOtherSessions` has one call site), still uses `email_confirm: true`, and neither path requires a current password. The original chain works today: steal cookie → change email silently → "forgot password" → own the account. And _that_ reset revokes the owner's sessions, locking them out. |
| **B-06**                               | LOW-MED  | **Not fixed.** The blanket grant is still after the migration loop in `test-rls.sh`, and there are still zero ACL assertions. `test-privilege-parity.sh` (new, good) checks chain-vs-snapshot _parity_, never _correctness_ — a migration that wrongly grants a column passes both gates.                                                                                                               |
| **R-05**                               | MEDIUM   | Partial. `0085` closed the temporal axis (an incoming student can no longer read a prior occupant's feedback). The per-student axis remains: `student_feedback` is still a scalar on the shared session row, so co-attendees can read and overwrite each other's, and the tutor being reviewed can still read it.                                                                                       |
| **N-01/06/07**                         | MEDIUM   | Guardian consent is now a real signal — but `requiresGuardianConsent` **fails open** when a student row has neither `guardian_name` nor `date_of_birth`, both optional at invite time. The write is still fire-and-forget. `needsPolicyReacceptance` is **dead code** — re-acceptance is an optional banner, never enforced. No withdrawal column, no withdrawal path.                                  |
| **B-01, B-09, B-13, N-09, N-11, N-12** | LOW      | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                              |

---

## 5. Assessment

**Twelve findings closed, including both round-4 blockers, and the fixes are structurally good.** `R-01` was fixed at all three levels I identified — ordering, generation, and an order assertion — plus a privilege-parity gate I hadn't asked for that compares 3427 ACL rows between chain- and snapshot-provisioned databases. `V-07` went from a hand-maintained list to 26 monitored + 14 exempt with written reasons and a parity test that makes a silent gap impossible. `A-09` and `A-10` are one-line fixes done correctly with the right reasoning.

But this round also produced three HIGHs, and they are not independent:

**Every one is a rule enforced in TypeScript over a broader database policy.** That is the same finding I have written up in four consecutive rounds — `enforce_deadline` (A-03), the mentor write leak (A-07), `drive_link` (A-03 residual), and now mentee-note minimisation, the reminders guard, and the reminders insert policy. The architecture makes PostgREST a first-class attack surface, the team knows this — `0009`, `0028` and `0067` all say so in their headers — and new features keep shipping the app-only version first.

**And two of the three were caused by fixes to my own earlier findings.** W-02 exists _because_ the OAuth callback now activates pending invites (my B-10 fix). W-05 exists because V-01 was fixed at the assignment site and not as a class. That is worth stating plainly: on a codebase at this level of remediation velocity, the remaining risk is increasingly _introduced by remediation_, and a fix that lands only at the named call site is a fix that will need auditing again.

**On A-04 specifically:** the commit claims auth hardening and the password half is genuinely improved, but the headline attack is unmitigated. I want to be precise, because "partially fixed" understates it — the original account-takeover chain works today exactly as written in the first audit.

**Not production-ready.** The list is short and every item is well-understood.

### Order

1. **W-03** — invert the trigger to test `OLD`, then `revoke all on reminders` + column grants. Two small changes; the second also closes W-04.
2. **W-01** — move the tenure predicate into `mentee_notes_read`. Minors' pastoral data.
3. **W-02** — export `requiresGuardianConsent`; gate the shared bind path.
4. **A-04** — require a current password; drop `email_confirm: true` for user-initiated changes; revoke sessions on the email path too.
5. **W-05 / W-09** — audit _every_ `createAdminClient()` write for a mentor-admitting gate, rather than fixing the two named sites. This is the third round this shape has appeared.
6. **W-06** — extend erasure to `guardians` and `student_feedback`; add a test asserting no PII table references an erased id.
7. **B-06** — move one `psql` block above the migration loop; add `has_column_privilege` assertions.
8. **W-10, W-07, W-08**, then the LOW cluster.
