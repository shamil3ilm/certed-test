# Production Security Re-Audit (Round 4) — Cert-Ed Academia

**Date:** 2026-08-26
**Target:** `feature/cert-ed-academia-app` — HEAD `fa11762`
**Prior rounds:** [08-20 audit](./2026-08-20-security-audit.md) @ `2bda9c0` · [08-25 re-audit](./2026-08-25-security-reaudit.md) @ `4ab16dd` · [08-25 round 3](./2026-08-25-security-reaudit-round3.md) @ `5e23697`
**Delta:** 7 commits · 37 source files · migrations `0080`–`0082`
**Build state verified by me:** `vitest run` → **1179 passed / 157 files** (up from 1161/153).

`/claude-security` is still not installed; the built-in `security-review` skill was run in its place as **Audit A**. **Audit B** is my own reading, including an empirical PostgreSQL test.

---

## 1. Verified fixed — eleven findings closed

Each re-derived from current code. Where a fix depends on a third-party library, I read the library source; where it depends on SQL semantics, I tested against a real database.

| ID                                 | Verdict   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R-02** cookie TTL                | **FIXED** | The fix supplies a custom `cookies` adapter instead of `cookieOptions`. I traced it: `@supabase/ssr` `cookies.js:114-118` binds `setAll = cookies.setAll` when accessors are supplied, so `documentCookieSetAll` never runs. The library still hard-overrides `maxAge` to 400 d at `:205`, but that object is now only the _input_ to our `serializeHardenedCookie` → `hardenCookieOptions`, which caps it. Output: `Max-Age=2592000; Secure`. `maxAge:0` deletions preserved. |
| **R-03** history PII               | **FIXED** | [history.ts:112-116](../../src/lib/services/page-data/history.ts#L112-L116) now tiers three ways — admin-tier target → `'Administrator'`; super-admin viewer → `full_name ?? email`; everyone else → `full_name ?? User <8-char id>`. The cross-tier email fallback that _was_ the finding is gone.                                                                                                                                                                            |
| **A-08** PII read ordering         | **FIXED** | [page.tsx:26-30](<../../src/app/(prt)/admin/users/[id]/page.tsx#L26-L30>) — `selectProfileRole(id)` → `canManageTarget` → _then_ `selectProfileDetailsById`.                                                                                                                                                                                                                                                                                                                   |
| **A-13** `?tag=`                   | **FIXED** | Validated one layer down at `services/tags.ts:87` (`z.string().uuid()` → empty match), which covers every caller rather than the one page. `?subject=` never reaches Postgres (in-memory compare).                                                                                                                                                                                                                                                                             |
| **R-09** `getManagerSession`       | **FIXED** | `sessions.ts:176-181` now takes an actor and calls `canManageClass` before the service-role read of `staff_note`.                                                                                                                                                                                                                                                                                                                                                              |
| **A-15** revoked recipients        | **FIXED** | `recipient-policy-resolver.ts:177-182` applies one terminal `selectActiveIdsAmong` over the whole recipient map — structurally stronger than the per-branch patching I recommended.                                                                                                                                                                                                                                                                                            |
| **R-07** raw `.ilike`              | **FIXED** | `messages-rows.ts:47` now escaped; sweep confirms every `.ilike`/`.or` site routes through the helper.                                                                                                                                                                                                                                                                                                                                                                         |
| **N-08** function ACLs             | **FIXED** | `teaches_class_write` now revoked (snapshot `:4248`). Enumerated all functions: **29 defined, 29 revoked, 0 missing.**                                                                                                                                                                                                                                                                                                                                                         |
| **`profiles_self_update`**         | **FIXED** | `0080` adds an explicit `WITH CHECK` identical to `USING`, **plus** a `BEFORE UPDATE` trigger (`guard_profile_privileged_columns`) that blocks `role`/`status`/`auth_user_id` changes regardless of policy or grants — so it survives a schema dump.                                                                                                                                                                                                                           |
| **A-03(c)** post-deadline withdraw | **FIXED** | `submissions_update` `USING` now carries the `enforce_deadline AND now() > due_date` exclusion.                                                                                                                                                                                                                                                                                                                                                                                |
| **B-11** seed enum                 | **FIXED** | `role: 'tutor'`. **My round-3 report says "still `role: 'teacher'`" — that is now stale**; it was true at `5e23697` and was corrected in `71be574`.                                                                                                                                                                                                                                                                                                                            |

Also improved: **B-02 HIGH → MEDIUM.** `docs/security-operations.md:49-63` now carries a seven-row dashboard checklist, correctly cross-referenced to the finding each row backstops, plus signup-disable in the deploy checklist. Still unverified, undated, unasserted, and missing a brute-force row — so not closed, but it went from nothing to an actionable operator control.

---

## 2. R-01 — the epilogue is present, CI-gated, and ordered wrong

**Severity: HIGH operational / LOW security (fails closed) · proven twice, independently.**

The five missing `revoke ... on table` statements now exist (snapshot `:4430-4434`), and `tests/unit/snapshot-privilege-epilogue.test.ts` gates them in CI. The security intent is met: table-wide `GRANT ALL` no longer survives.

**But the epilogue sits _after_ pg_dump's column-GRANT block** (`:4283-4416`), and PostgreSQL cascades a table-level `REVOKE` to that table's column privileges. The migration chain does the opposite — `0033` revokes, _then_ `0064`/`0065` grant.

I stood up a scratch database and tested both orderings rather than cite the manual:

```
AFTER epilogue-order  -> can update full_name? false
AFTER migration-order -> can update full_name? true
AFTER migration-order -> can update role?      false
```

Audit A independently reproduced this on PostgreSQL 18. A snapshot-provisioned database therefore has **strictly fewer** privileges than the chain:

- `revoke select on table class_sessions` wipes all 13 column SELECTs → the attendance/session read path dies.
- `revoke update on table profiles` wipes 5 column UPDATEs → profile self-service dies.
- `revoke update on table notifications` wipes `read_at` → mark-as-read dies.
- `revoke insert, update on table submissions` wipes `is_active` → withdraw dies.

**Nothing in CI catches it.** `test-rls.sh` applies the migrations, never the snapshot; `restore-drill.sh:79` runs `pg_restore --no-privileges`, discarding the privilege model it would need to check.

**And the fix erases itself.** `scripts/rebuild-snapshot.sh` contains no epilogue logic — I grepped it. The block was hand-appended to a generated file whose own header says _"DO NOT hand-edit."_ The next `npm run db:rebuild-snapshot` deletes it; the unit test would catch the deletion, but the generator will keep reproducing the bug.

**Fix:** emit the epilogue from `rebuild-snapshot.sh` _before_ the ACL section, and extend the test to assert each `REVOKE ... ON TABLE t` precedes every `GRANT (col) ON TABLE t`.

---

## 3. A-07 needs qualifying — and I have been overstating it

I called A-07 "genuinely closed" in round 3. That was true of what I checked and incomplete as a claim. Two paths remain:

### V-01 — Assignment edits bypass the tutor-only narrowing through the service role

**MEDIUM.** `requireManageable` ([commands.ts:91-98](../../src/lib/services/assignments/commands.ts#L91-L98)) gates on `canManageClass`, which admits `hasMentorAuthority` — not `canWriteClass`, which mirrors the tutor-only `teaches_class_write`. And when `due_date` changes, the write routes to `callEditAssignmentAndReclassify` ([assignments.ts:215-217](../../src/lib/data/assignments.ts#L215-L217)), which uses `createAdminClient()` — **service role, RLS bypassed entirely**, with the comment _"the domain has already asserted canManageClass."_

So `assignments_update`'s `teaches_class_write` predicate never runs on that path. A mentor granted `manageClassContent` (override-grantable, and **not** in `REASON_REQUIRED_CAPABILITIES`, so no written reason is required) can rewrite title, description, due date, attachment link, topic and max marks on an assignment in a mentee's class they do not teach — and re-derive every student's on-time/late verdict.

I verified `canWriteClass` has only three real call sites: the attachments route (×2) and calendar-event DELETE. Content writes don't use it, so the comment claiming app and RLS "agree by construction" is accurate only for attachments.

### V-02 — `0082` re-widens calendar/timetable to mentors, class-wide, including DELETE

**MEDIUM.** `0082` is a documented product decision and it correctly preserves 0079 for announcements/resources/assignments/meet_links. But `mentors_class` is true for a mentor of **any one** enrolled student, and both policies are `FOR ALL` — so the grant is not "coordinate my mentee's sessions", it is INSERT/UPDATE/**DELETE** over the entire class schedule.

Tellingly, the app is stricter than the database here: [calendar-events.ts:166-169](../../src/lib/services/calendar-events.ts#L166-L169) restricts DELETE to `canWriteClass` with the comment _"DELETE is destructive, so it is tutor/admin only."_ RLS permits what the app forbids, so a mentor reaching PostgREST directly gets the delete the app denies them.

### V-03 — `FOR ALL` grants DELETE on attendance and class_sessions

**MEDIUM.** `attendance_write` and `class_sessions_write` remain `FOR ALL` on `teaches_class`. No migration revokes DELETE from `authenticated` anywhere, so it is gated by RLS alone. `attendance_write`'s careful enrolment guard lives only in `WITH CHECK`, which DELETE never consults. And [timetable-slots.ts:103](../../src/lib/services/timetable-slots.ts#L103) states the intent outright — _"Deactivate = soft-delete (spec section 8)"_ — while RLS permits a hard delete.

**Fix for all three:** split the `FOR ALL` policies into `FOR INSERT`/`FOR UPDATE` on `teaches_class` and `FOR DELETE` on `teaches_class_write` (or admin-only); point `requireManageable` at `canWriteClass`; add the scheme CHECK to `assignments.attachment_drive_link` so the service-role RPC cannot store a dangerous URL.

---

## 4. Other new findings

**V-04 — A-03's scheme CHECK covers 1 of 4 link columns.** `submissions.drive_link` has it (`snapshot:752`, validated not `NOT VALID`, and the regex correctly resists `javascript:`, leading whitespace/newline, case tricks, `data:` and scheme-relative). `resources.drive_link`, `resource_versions.drive_link` and `assignments.attachment_drive_link` have none — against `0081`'s own stated goal of enforcing "at the COLUMN so every write path is covered."

**V-05 — a render site still bypasses the href guard.** `students/[id]/detail-shared.tsx:7-14` (`DriveLink`) emits a raw `<a href={href}>` for `row.driveLink` / `submission.driveLink`, while the rest of the app routes through `safeExternalHref`. Pre-`0081` rows and any resource link are unconstrained, and the page is staff-facing — so the viewer whose `httpOnly:false` session cookie would be read is a tutor or admin.

**V-06 — the mock-var guard fails open off-Vercel.** `mock/env.ts:45` returns early unless `VERCEL_ENV === 'production'`, so on a self-hosted `next start` it never runs — while `isMock()` _does_ allow activation there via `MOCK_MODE=1 ALLOW_MOCK_AUTH=1`. Detection is fail-closed; scoping is fail-open, and the gap is exactly the deployment the guard exists for.

**V-07 — the RLS alarm list is still hand-maintained and 40% incomplete.** `mentee_notes` was added (good — that was my round-3 finding), but 16 of 40 RLS-enabled tables remain unmonitored, including **`payslip_lines` and `receipt_lines`** — the parents are watched, the line items carrying the actual amounts are not. No test binds the list to the schema.

**V-08 — the mock-var list is now duplicated with no parity test.** `next.config.js:33-40` hand-copies `MOCK_ONLY_ENV_VARS` from `mock/env.ts:21-27`, bound only by a comment. Same hand-maintained-list failure as V-07 and N-08 — reintroduced in the commit that fixed them.

---

## 5. Still open, unchanged

| ID                                                     | Sev      | Note                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A-04**                                               | **HIGH** | Re-grepped the whole repo: the only session-terminating call is the user's own `/api/logout`. No `signOut('global')`, no `banned_until`. Revoking a user flips `profiles.status` and leaves their JWT live. This is the finding that turns every session-exposure issue into permanent takeover. |
| **B-02**                                               | MEDIUM ↓ | Documented, still unverified/undated; brute-force row missing.                                                                                                                                                                                                                                   |
| **A-09**                                               | MEDIUM   | `isClassAdmin` still override-blind. Sharper reading than I had: the admin UI renders a denied capability as _"Revoked — override"_ while ten operation classes keep working academy-wide. A control that misreports its own state is worse than an absent one.                                  |
| **A-10**                                               | MEDIUM   | `hasMentorAuthority` still tested before `isTutor`, so a pastoral assignment upgrades a tutor from `edit:'own'` to `edit:'yes'`.                                                                                                                                                                 |
| **R-05**                                               | MEDIUM   | `class_sessions_read` untouched — `0077` fixed the _write_ `WITH CHECK` only. An incoming student still reads the prior occupant's feedback.                                                                                                                                                     |
| **B-01**                                               | MEDIUM   | Reset still browser→Supabase; server never sees the password.                                                                                                                                                                                                                                    |
| **B-10**                                               | MEDIUM   | OAuth bind still requires no setup code and leaves `status`/code untouched — bricking the owner's registration path.                                                                                                                                                                             |
| **N-03/04/05**                                         | MEDIUM   | Mentee notes: new mentor still inherits the full history; no erasure/rectification; reads still unaudited.                                                                                                                                                                                       |
| **N-06/07**                                            | MEDIUM   | Consent write still fire-and-forget; **nothing reads the table**; no re-acceptance, no withdrawal.                                                                                                                                                                                               |
| **B-06**                                               | LOW-MED  | Blanket grant still after the migration loop; 67 assertions, 0 ACL assertions. The suite tests _policies_; the finding was always about _grants_.                                                                                                                                                |
| **B-09, B-13, N-09–N-12, CSP `form-action`, CI token** | LOW      | Unchanged.                                                                                                                                                                                                                                                                                       |

---

## 6. Assessment

**This round is the strongest yet: eleven findings closed, none regressed, and the fixes are landing at the right altitude.** `A-13` was fixed in the service rather than the page, so every caller benefits. `A-15` was fixed with one terminal filter instead of six per-branch patches. `R-02` correctly diagnosed a subtle library override and fixed it by owning the write. `0080` backed a policy with a trigger so the guard survives a schema dump. That is a team fixing classes of problem.

Three patterns persist, and all three recurred again this round:

1. **Hand-maintained lists drift.** V-07 (16 unmonitored tables), V-08 (duplicated mock-var list) — and V-08 was introduced _by_ the commit that fixed the previous instance. Derive them.
2. **A remedy lands on the named site, not the class.** V-04 (1 of 4 link columns), V-05 (one render site still raw).
3. **Service-role paths quietly bypass RLS narrowing.** V-01 is the sharpest instance: three consecutive audits, mine included, recorded `0079` as closing A-07 — and the assignment edit path was going around it the whole time.

**On my own accuracy.** Round 3 I marked four things fixed that were partial. This round I checked the library source and tested the SQL semantics on a live database before asserting, and my verdicts held. But I still overstated A-07 across two rounds by verifying the RLS policies without asking which write paths actually reach them. **The lesson is consistent: verifying that a control is correctly configured is not the same as verifying that every path goes through it.**

**Not production-ready**, on a shrinking and increasingly well-understood list: **A-04**, **R-01's ordering**, **V-01**, and **B-02**.

### Order

1. **R-01 ordering** — move the epilogue before the ACL section, generate it from the script, assert position in the test. Breaks provisioning today and is invisible to every CI gate.
2. **V-01** — point `requireManageable` at `canWriteClass`; add the scheme CHECK to `assignments.attachment_drive_link`.
3. **A-04** — global sign-out on credential change and on revoke. ~10 lines; also closes A-15's session tail.
4. **B-02** — walk the dashboard, record the dates, add the brute-force row.
5. **V-02 / V-03** — split the four `FOR ALL` policies by verb.
6. **V-06** — invert the mock guard to fail unless positively known to be dev/preview.
7. **V-07 / V-08** — derive both lists; add the function-`REVOKE` CI assertion.
8. **A-09 / A-10** — two one-line permission-flag corrections with tests. A-09 especially: the UI currently lies about it.
9. **V-04 / V-05**, then the LOW cluster.
