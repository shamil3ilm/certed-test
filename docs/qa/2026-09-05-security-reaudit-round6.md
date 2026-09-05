# Production Security Re-Audit (Round 6) — Cert-Ed Academia

**Date:** 2026-09-05
**Target:** `feature/cert-ed-academia-app` — HEAD `0f999c8`
**Prior rounds:** [08-20](./2026-08-20-security-audit.md) · [08-25](./2026-08-25-security-reaudit.md) · [08-25 r3](./2026-08-25-security-reaudit-round3.md) · [08-26 r4](./2026-08-26-security-reaudit-round4.md) · [09-02 r5](./2026-09-02-security-reaudit-round5.md)
**Delta:** 31 commits · migrations `0090`–`0095` · new: hours-based billing, sub-admin class authority, multi-session attendance, academy hours report
**Build state verified by me:** `vitest run` → **1350 passed / 170 files** (up from 1265/166).
**Working tree:** not clean — an uncommitted Node 20→22 pin (`.nvmrc`, `package.json` engines, `ci.yml`) plus e2e/doc edits. Benign, and it resolves the Vercel `engines` warning. Audited at HEAD.

---

## 0. Lead finding — unauthenticated forgery of financial documents

**C-01 — CRITICAL.** `supabase/migrations/0095_hours_billing.sql:158,205`

`0095` re-signs `issue_receipt_doc` and `issue_payslip_doc` with a 13th argument and restores their ACLs. Compare the two revokes side by side:

```sql
-- 0034:14  (the established pattern)
revoke execute on function public.issue_receipt_doc(...12 args) from public, anon, authenticated;

-- 0095:158 (the replacement)
revoke all    on function public.issue_receipt_doc(...13 args) from public;
```

`anon, authenticated` were dropped from the revoke list. This matters because the 13-argument signature is a **new** function created after `0034`, so Supabase's project-level `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role` grants EXECUTE at creation — and `REVOKE ... FROM PUBLIC` does **not** remove a grant held directly by a named role. `PUBLIC` and `anon` are distinct grantees.

Both functions are `SECURITY DEFINER` and perform **no self-authorization** — they were only ever safe because nothing but `service_role` could call them. Audit A executed the attack against a chain-provisioned database:

```
set local role anon;
select (public.issue_payslip_doc(null,'FORGED TUTOR',null,current_date,'AED',...,9999,...)).number;
 -> PS-2026-0001
```

An unauthenticated caller holding only the publishable key embedded in the browser bundle can mint numbered receipts and pay slips with arbitrary party, amount, currency and billing period, and burn the shared `document_counters` sequence. **This is live on the migration chain, not only the snapshot** — it is not conditional on a provisioning path.

The migration's own comment says _"ACLs are restored below."_ They are not.

**Fix:** `revoke all on function public.issue_receipt_doc(<13 args>) from public, anon, authenticated;` and the same for `issue_payslip_doc`. Then add the CI assertion described in C-02.

---

## 1. Two more privilege-layer failures of the same family

**C-02 — HIGH.** The R-01 epilogue is table-only; function privileges leak in the snapshot.

Round 5 recorded R-01 as closed "at all three levels." That was true **for tables**. `scripts/rebuild-snapshot.sh` emits table REVOKEs only; `snapshot-privilege-epilogue.test.ts` explicitly excludes function revokes; and `test-privilege-parity.sh` diffs `role_table_grants` + `column_privileges` and nothing else. The snapshot never re-emits `0034`'s `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.

Audit A diffed `pg_proc.proacl` between chain- and snapshot-provisioned databases: **11 functions** gain `anon`+`authenticated` EXECUTE in the snapshot that the chain restricts to `service_role` — including `revoke_profile_guarded`, `claim_pending_emails`, `edit_assignment_and_reclassify` and `next_document_number`. Demonstrated:

```
-- as authenticated:  select public.revoke_profile_guarded('<any uuid>')  -> account disabled
-- as anon:           select * from public.claim_pending_emails(5)
                      -> invitee@x.test | Your setup code | <b>CODE 123456</b>
```

Any signed-in user can disable any non-last-admin account; an anonymous caller can read queued invite codes and reset links and mark them `sending` so they are never delivered. This is the R-01 failure mode displaced from tables to functions, and every gate added for R-01 is blind to it.

**C-03 — HIGH.** `class_sessions` column grants are inert — a student can rewrite the hours that become money.

Only `revoke select on table class_sessions` was ever issued (`0070`). Table-level `INSERT/UPDATE/DELETE` were never revoked, so `0068`'s `grant update (student_feedback)` restricts nothing: `authenticated` retains table-wide UPDATE from Supabase's defaults, and `class_sessions_student_feedback_update` filters **rows**, not **columns**. Verified as an enrolled student:

```
update class_sessions set actual_start = now()-interval '20 hours', actual_end = now(),
       summary='REWRITTEN BY STUDENT', staff_note='STUDENT WROTE HERE',
       tutor_id='<own profile id>' where class_id='<their class>';   -> 2 rows
```

`actual_start`/`actual_end` are the sole basis of `getAcademyClassHours` and therefore of the `0095` pay-slip generator — this is direct financial-record tampering. `tutor_id` re-attributes the session. `staff_note` is _write_-enabled for exactly the role `0070` exists to hide it from (read is correctly denied). `src/lib/data/class-sessions.ts:190` asserts the opposite: _"the class_sessions RLS ... student_feedback column only (migration 0068) — is the real control."_

---

## 2. The hours-to-money chain

**C-04 — HIGH.** `attendance.session_id` is unbound from `class_id`.

`0094` made `session_id NOT NULL` and `0095` made attendance-by-session the money input. But the column carries only a bare `FK ... REFERENCES class_sessions(id)` — no composite FK, no CHECK, no trigger binding it to `class_id`/`session_date` — and `attendance` has **no column grants and no epilogue revoke**, so `authenticated` writes it directly. `attendance_insert` authorizes on `class_id` + enrolment only.

`teaching-hours.ts:236-252` resolves the class **from the session**, so a tutor of class A can attach a mark for their own student to a longer session of class B, and those hours flow into a receipt. `marking.ts` validates session↔class — in application code, which PostgREST bypasses.

**Fix:** add `UNIQUE (id, class_id, session_date)` on `class_sessions` and make attendance's FK composite on all three columns. Then revoke and re-grant `attendance` columns, excluding `session_id` from UPDATE.

**C-05 — MEDIUM.** Nothing on the issue path is derived server-side. `src/lib/finance/issue.ts:34-41`

Despite the feature name, `buildBillingDraft` is a read-only _fill_ returned to the browser; the POST body is the sole source of truth. `rate` is never compared to `billing_rates`, `currency` comes from the body rather than the party's stored currency, `hours` are free numbers, and `billing_period` is a free client field — so the duplicate-month check is a client-side warning, defeated by omitting the field. There is no unique constraint and no lock, so two concurrent issues for the same party+period both succeed.

Finance write is admin-only, so this is an integrity control rather than an escalation — but combined with C-01 it is the difference between "an admin can mistype" and "anyone can mint."

**C-06 — MEDIUM.** Self-dealing: the payee writes the hours. `sessions.ts:78`, `mentor-session-timings.ts:245`

Pay is `sum(actual_end − actual_start)` grouped by `tutor_id`, and a tutor records their own sessions on their own attribution with no second party, no approval state, and no lock after issuance. The 24-hour cap and overlap check bound a single session, not a month of non-overlapping ones. Worth a deliberate product decision: a `confirmed_by` set by a non-payee, or freezing the contributing session ids at issuance.

---

## 3. Verified fixed

All of my round-5 HIGHs are closed and hold up under direct attack:

| ID             | Verdict     | Evidence                                                                                                                                                                                                                                                       |
| -------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W-01**       | **FIXED**   | The tenure predicate is now _in_ `mentee_notes_read` (`author_id = current_profile_id() OR created_at >= min(pa.assigned_at)`, `COALESCE` to `'infinity'` so it fails closed). Audit A confirmed the prior mentor's note is withheld via direct PostgREST.     |
| **W-02**       | **FIXED**   | `requiresGuardianConsent` extracted to `src/lib/auth/minor.ts` and consumed by **both** paths; `binding.ts:34` refuses the OAuth bind for a minor. The fail-open is closed with the right domain call: _"a KG-12 student is a minor unless proven otherwise."_ |
| **W-03**       | **FIXED**   | Immutability checked **first**, ownership read from `OLD`, plus `revoke all on table public.reminders` with `created_by`/`user_id`/`class_id` INSERT-only. Both layers. Attacks return `42501` / `P0001`.                                                      |
| **W-04**       | **FIXED**   | `reminders_insert` now requires active enrolment in the named class.                                                                                                                                                                                           |
| **W-07, W-08** | **FIXED**   | Personal hours filter on `tutor_id`; session-time writes gained `isCalendarDate` + `assertClassActive`.                                                                                                                                                        |
| **W-06**       | **PARTIAL** | `deleteGuardiansForStudent` added — guardian PII is now erased. `class_sessions.student_feedback` still survives erasure.                                                                                                                                      |
| **W-10**       | **PARTIAL** | Both CHECKs added and `meet-parts.tsx` routed through `safeExternalHref` — but see C-07.                                                                                                                                                                       |

Also confirmed by sweep: 41/41 tables have RLS; zero `USING (true)`; every `SECURITY DEFINER` function pins `search_path`; the four verb-split policies were **not** re-widened; `0f999c8`'s re-runnable function replacement is correct (exactly one overload each, no stale callable signature).

---

## 4. Other findings

**C-07 — MEDIUM.** `0090`'s `notifications_link_scheme` rejects every link the app writes — the notification channel is silently dead.

`is_http_link` accepts only `null`, `'#'`, or `^https?://`. Every producer writes a **relative app path** — `/classroom/…`, `/messages/…` (announcements, assignments, attendance, meet links, messaging, resources, grading, submissions). Every insert violates the constraint, and `notifyBestEffort` swallows the error with `{ toSentry: false }`, so it does not even reach the error tracker. In-app **and** email notification produce nothing while every user action reports success. Students are no longer told their work was graded.

A security fix that silently disabled a subsystem, invisible to CI and to monitoring. **Fix:** accept a leading `/` internal path.

**C-08 — MEDIUM.** Mentor-admitting gates still front service-role writes — **fourth consecutive round.** `c69f152` closed the two named sites (`resource_versions`, `entity_tags`). Audit A enumerated all 86 service-role writes and found four remaining mismatches where `canManageClass` (admits a mentor) gates a `createAdminClient()` write on a table whose RLS excludes mentors for that verb: `deleteSessionTimes` and `clearAttendanceSession` (RLS: admin-only DELETE), `gradeSubmission`/`gradeStudentResult` (RLS has no staff write branch), `enrolStudent`/`removeStudent` (RLS: admin-only). A mentor can delete the payroll basis, wipe a class-date's attendance, grade as `graded_by`, and unenrol students.

**C-09 — MEDIUM.** Sub-admin authority is keyed on the raw persona flag, so deny overrides are inert. `class-write.ts:24-32`, `documents.ts:62`

`canWriteClass`/`canWriteCalendar`/`documentRoleFor` gate on `isSubAdmin` rather than the resolved capability, and the comment explains why — _"gating on a capability that an override could grant would make this guard looser than RLS."_ That reasoning is sound in one direction and produces the opposite defect: a `deny manageClassContent` is ignored by the app guard **and** by RLS, which has no notion of overrides. `canManageClass`, in the adjacent file, takes the opposite position with the opposite comment.

The root cause is architectural: **any capability also enforced at the RLS layer cannot be override-denied without app/RLS divergence.** The override UI promises something it cannot deliver for DB-backed capabilities. This needs a design decision, not a patched guard. `documentRoleFor` also gives sub-admin the _admin_ document row (edit/delete/share on others' documents).

**C-10 — MEDIUM.** A student can create timeless sessions that capture their own marks. `0093` dropped `unique (class_id, session_date)`, so the student-feedback INSERT policy is now unbounded. A student-created row has `actual_start = NULL`, and `resolveMarkingSession` orders `NULLS FIRST` — so the tutor's roster marking attaches to a 0-minute session and the student's billed hours drop.

**C-11 — MEDIUM.** `/admin/teaching-hours` now returns every student's name, classes and hours academy-wide behind `requireCapability('manageClasses')` — which is in neither `HARD_CAPABILITIES` nor `REASON_REQUIRED_CAPABILITIES`, so it is grantable with no written reason, and also confers `canManageClass` on every class.

**C-12 — MEDIUM.** The billing-rates **page** gates on `viewFinance` alone while its action requires `viewFinance` + `isAdminTier`, and `draftHandler` is admin-only with the comment _"a person's hourly rate ... is admin-tier data."_ An override-granted finance viewer reads every tutor's and student's rate card. `loadBillingRatesPageData()` takes no actor and performs no check.

**LOW:** `reminders.completed_at` grantable and unguarded (C-13); `updateStudentJoinTime` accepts an unvalidated `sessionId`, skipping both window guards (C-14); `verifyOwnPassword` mints an unrevoked GoTrue session per attempt and locks OAuth-only users out of email change (C-15); `crossHostUrl` still decides "local" by substring on the Host header (C-16); the committed snapshot is not reproducible from its own generator (C-17).

---

## 5. Still open

| ID            | Sev      | Note                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-04**      | **HIGH** | The email door is shut — current password now verified server-side via an isolated throwaway client. The **password** door is not: `changeOwnPassword` requires no current password. The chain reroutes and gets _simpler_: steal cookie → change password → `signOutOwnOtherSessions` evicts the owner while `scope:'others'` preserves the attacker. The `verifyOwnPassword` helper already exists. |
| **R-05**      | MEDIUM   | Feedback is still a shared scalar; `0093` added a sub-case — a student who attended only session A can read and overwrite session B's feedback on the same date.                                                                                                                                                                                                                                      |
| **N-06/N-07** | MEDIUM   | Consent write still fire-and-forget; `needsPolicyReacceptance` still dead code; no withdrawal column or path.                                                                                                                                                                                                                                                                                         |
| **B-06**      | LOW-MED  | Blanket grant still after the migration loop; zero ACL assertions. `test-privilege-parity.sh` checks parity, never correctness — and covers neither function privileges nor default ACLs, which is why C-01/C-02 shipped green.                                                                                                                                                                       |

---

## 6. Assessment

**The remediation of my round-5 findings is excellent** — W-01, W-02, W-03 and W-04 are closed at both the app and database layers, verified under direct attack, and W-03 in particular was fixed exactly as recommended (trigger ordering _and_ column grants). Six findings closed, none regressed among them.

**But this is the most severe round of the series, and the reason is a pattern that has now inverted.** For five rounds the recurring defect was _a rule enforced only in application code while the database was broader_. This round the two worst findings are the mirror image: **privilege-layer changes that looked complete because the gates built to check them were scoped one level too narrowly.**

- The R-01 epilogue and both its CI gates cover tables. `0095` created new functions. The gates never looked.
- `0034` established `from public, anon, authenticated`. `0095` wrote `from public`. Nothing compares a new function's ACL to the pattern.
- `0070` revoked `SELECT` on `class_sessions` and nobody revoked the other verbs, so `0068`'s column grant has been decorative since the day it landed.

**And one security fix silently broke a subsystem.** `0090`'s link constraint rejects every notification the app writes, and the best-effort catch means neither users nor Sentry see it. Notifications have been dead since that migration, with green CI throughout.

**Not production-ready.** C-01 is unauthenticated financial forgery and should be treated as an incident-grade fix, not a backlog item.

### Order

1. **C-01** — `revoke all on function issue_receipt_doc/issue_payslip_doc from public, anon, authenticated`. One line each. Then check whether these functions were reachable in any deployed environment.
2. **C-02** — function-privilege epilogue + extend `test-privilege-parity.sh` to `role_routine_grants` and `pg_default_acl`. This is what would have caught C-01.
3. **C-03** — `revoke insert, update, delete on table class_sessions from authenticated`, keeping the column grants.
4. **C-07** — accept internal paths in `is_http_link`; notifications are currently dead in production.
5. **C-04** — composite FK binding `attendance.session_id` to `class_id`/`session_date`.
6. **A-04** — apply the existing `verifyOwnPassword` to the password path.
7. **C-05 / C-06** — derive amounts server-side; decide the separation-of-duties question on hours.
8. **C-08** — fix as a class this time: assert, in CI, that every `createAdminClient()` write's fronting gate is no broader than the RLS policy for the same verb.
9. **C-09** — decide the override/RLS architecture question.
10. **C-10 through C-17.**
