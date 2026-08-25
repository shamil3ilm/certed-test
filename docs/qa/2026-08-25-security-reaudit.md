# Production Security Re-Audit — Cert-Ed Academia

**Date:** 2026-08-25
**Target:** `c:\laragon\www\wed_cert` @ `feature/cert-ed-academia-app` — HEAD `4ab16dd`
**Baseline:** the 2026-08-20 audit at `2bda9c0` ([docs/qa/2026-08-20-security-audit.md](./2026-08-20-security-audit.md))
**Delta audited:** 21 commits · 154 files · +5149/−644 · migrations `0066`–`0076` · new features: guardians, consents, privacy/terms, multi-tutor, assignment types, `manageAttendance`
**Build state verified by me:** `vitest run` → **1154 passed / 150 files**; `tsc --noEmit` → **exit 0**.

---

## 0. `/claude-security`

Still **not installed** — no command, skill, or plugin by that name in `~/.claude/commands`, `~/.claude/plugins`, or `.claude/`. Claude Code's built-in **`security-review`** skill was run again in its place as **Audit A**, scoped this time to the delta plus an adversarial pass over the claimed fixes. Its standing exclusions (DoS, rate limiting, secrets-at-rest, dependency CVEs, docs, test files) apply.

**Audit B** is my own reading of the source, covering the full brief.

---

## 1. Remediation verification — the headline result

**I did not take the remediation table at face value.** Every claimed fix was re-derived from current code, and where a fix touches the database, from the end-state snapshot rather than the migration's own comment.

| ID   | Claimed | **Verified**           | Evidence                                                                                                                                                                                                                                                                                               |
| ---- | ------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A-01 | Fixed   | **FIXED**              | `admin/settings/actions.ts:32` + `page.tsx:14` both `requireRole(['admin'])` — persona-based, not override-grantable. Sibling writers (messaging matrix, base currency) admin-locked with service re-checks.                                                                                           |
| A-02 | Fixed   | **FIXED**              | `attach-guards.ts:27-40` checks own + active + ungraded + assignment-active + deadline-open. All four owner kinds covered; `uploadAttachment` has exactly one caller.                                                                                                                                  |
| A-03 | Fixed   | **PARTIAL**            | Deadline **is** in the RPC body (`0067:40-42`) and in the snapshot. `authenticated`'s only remaining grant on `submissions` is `UPDATE(is_active)` — every INSERT grant is gone. **But** the `drive_link` allowlist is still app-only, and `UPDATE(is_active)` still permits a post-deadline withdraw. |
| A-05 | Fixed   | **PARTIAL — see R-02** | Hardened on the two server paths only. The browser client is unhardened.                                                                                                                                                                                                                               |
| A-08 | Fixed   | **PARTIAL**            | `canManageTarget` gate is present and correct — but runs _after_ the full PII row is read (`page.tsx:20` then `:26`). A separate cross-tier path remains open (R-03).                                                                                                                                  |
| A-11 | Fixed   | **FIXED**              | Best fix in the set: explicit `tutor_id` is admin-only **and** UUID-validated **and** `assertClassTutor`-checked. The new `staff_note` field was checked for the same defect class and is clean.                                                                                                       |
| A-12 | Fixed   | **FIXED**              | All 7 `.or()` sites now use `escapeOrIlike`. (A sibling helper defect remains — R-07.)                                                                                                                                                                                                                 |
| A-14 | Fixed   | **FIXED**              | `attach-guards.ts:74-81` authorizes `'edit'` on replacement and passes `uploaded_by`, which is load-bearing for the tutor `'own'` rule.                                                                                                                                                                |
| B-03 | Fixed   | **FIXED** (on Vercel)  | `rate-limit.ts:43-55` prefers `x-vercel-forwarded-for`, else **rightmost** XFF. Residual: that header is trusted unconditionally, so off-Vercel it is spoofable.                                                                                                                                       |
| B-05 | Fixed   | **FIXED**              | Every failure branch returns a fixed string; upstream detail goes to `console.error` only.                                                                                                                                                                                                             |
| B-08 | Fixed   | **PARTIAL**            | Mock gate now fails closed on `NODE_ENV==='production'` too — genuinely fixed. The Sentry scrubber is wired on both inits but is **shallow** and covers only `extra`/`tags`, not `message`, `exception.value`, `breadcrumbs`, or `request.url`.                                                        |

**Also verified fixed and worth naming:** migrations `0067`/`0068`/`0070` are model remediations — each takes a rule that lived only in TypeScript and mirrors it in RLS **and** column grants. `0070` withholding `staff_note` from the `authenticated` SELECT list (verified absent from the snapshot's grant block) is exactly right, and fail-closed for future columns. `0066`'s `FOR UPDATE SKIP LOCKED` email claim is correct disjoint-batch semantics with no TOCTOU window.

**Nothing on the "Open" list has been fixed.** Two items got worse (A-04, A-07); one is narrower than originally stated (B-12).

---

## 2. New findings this run

### HIGH

**R-01 — The rebuild snapshot omits every table-level `REVOKE`, so a snapshot-provisioned environment is wide open.**
`supabase/rebuild/0000_full_rebuild.sql`

I counted 24 `REVOKE` statements in the snapshot; **zero** are `REVOKE ... ON TABLE`. The migration chain contains six protective ones:

```
0001:74   revoke update on table profiles from authenticated;
0009:13   revoke insert, update on table submissions from authenticated;
0024:60   revoke update on table notifications from anon, authenticated;
0033:19   revoke update on table profiles from authenticated;
0067:93   revoke insert on table submissions from authenticated;
0070:20   revoke select on table class_sessions from authenticated;
```

`supabase db dump --schema public` strips role grants, and a real Supabase project pre-installs `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role`. So every `CREATE TABLE` in the snapshot hands `authenticated` **ALL** privileges, and nothing takes them back. The additive column grants that _are_ present (`GRANT SELECT(id) ON TABLE class_sessions ...`) are no-ops on top of a total grant.

This re-opens, in any snapshot-built environment:

- **self-promotion** — `PATCH /rest/v1/profiles?id=eq.<self>` with `{"status":"active","role":"admin"}`. `profiles_self_update` has no explicit `WITH CHECK`, so `USING` is reused and `auth_user_id` is unchanged → the write passes.
- **deadline bypass** — direct `INSERT` on `submissions`, undoing `0067`.
- **`staff_note` disclosure** — undoing `0070`.

**Production is unaffected** — it is built from the migration chain. The exposure is scoped to snapshot-provisioned environments, but `docs/operations.md:8` prescribes exactly that for the annual restore drill, `supabase/README.md:10` calls the file "the intended end state", and `production-checklist.md:18` treats it as the reference. I rated this LOW/INFO as B-07 in the first audit, on the narrower ground that the repo "cannot prove the privilege model." That was too soft: it does not merely fail to prove it — applied as documented, it produces the wrong one.

**Fix:** have `rebuild-snapshot.sh` emit a generated privilege epilogue derived from `information_schema.role_table_grants` / `column_privileges`, and extend `check-snapshot-freshness.sh` to fail when the snapshot's `REVOKE ... ON TABLE` count is below the chain's.

---

### MEDIUM

**R-02 — The A-05 cookie fix covers the server paths but not the browser, which is the primary writer.**
`src/lib/supabase/client.ts:31-36`

`hardenCookieOptions` is applied at `server.ts:19` and `middleware.ts:30`. But:

```ts
export function createClient() {
  return createBrowserClient(
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_URL', ...),
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ...),
  )   // no third argument → no cookieOptions
}
```

Sign-in runs client-side (`auth-client.ts:68` `createClient().auth.signInWithPassword`), so the session cookie is **first written by the browser** using `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS` — `{path, sameSite:'lax', httpOnly:false, maxAge: 400 days}`, **no `secure` key**. Both stated controls are bypassed on the path that actually creates the cookie: the documented 30-day inactivity ceiling is 400 days for any user who signs in and leaves, and the cookie ships without `Secure` until a middleware refresh happens to rewrite it. HSTS mitigates but has no `preload`, so first contact on a hostile network is exposed.

**Fix (one line):** pass `{ cookieOptions: { secure: process.env.NODE_ENV === 'production', maxAge: MAX_SESSION_SECONDS } }`, exporting the constant from `cookie-options.ts` so the two paths cannot drift.

**R-03 — `/admin/history` discloses admin-tier emails to any override-granted `viewHistory` holder.**
`src/lib/services/page-data/history.ts:66,95`

`loadHistoryPageData(searchParams)` takes **no actor** and applies no tier clamp. `searchProfileIds` → `selectProfileIdsBySearch` (`profiles-directory.ts:117-121`) runs `.or('full_name.ilike.…,email.ilike.…')` on a service-role client across **every role**, unlike the People list which clamps to `SUB_ADMIN_VISIBLE_ROLES` before querying. Line 95 then renders `actorLabel: actor.full_name ?? actor.email`.

`viewHistory` is not in `HARD_CAPABILITIES`, so it is override-grantable to a sub_admin, tutor, or mentor. That holder reads admin emails in the actor column wherever `full_name` is null (it is optional at `addUser`), and `?actor=<guess>` is an existence oracle — a hit filters the log, a miss substitutes the `NO_MATCH_ACTOR_ID` sentinel. This is the same read/write asymmetry as A-08, in a place the A-08 fix did not reach.

**R-04 — `class_sessions_student_feedback_update`'s `WITH CHECK` is weaker than its `USING`.**
`0068:45` / snapshot `:3342`

`USING` carries the attendance predicate — the whole point of the control. `WITH CHECK` is only `is_enrolled(class_id)`. The migration justifies this by delegating to the column grant, which makes a _row-security_ invariant depend on a _column privilege_ held in a different object, with no test binding them. It holds today; it fails the moment `authenticated` holds table-wide UPDATE (i.e. under R-01) or a future migration adds one more student-writable column.

**R-05 — Session feedback is readable class-wide and across enrolment churn.**
snapshot `:3326`, `:4227`

`student_feedback` is a single scalar on the session row. Reads fall under `class_sessions_read` (`is_active_admin() OR teaches_class() OR is_enrolled()`) plus `GRANT SELECT(student_feedback)`, with **no** per-author narrowing and **no** attendance predicate. Classes are reused as students rotate (`enrollments_one_active_student_per_class` is partial on `WHERE active`), so an incoming student reads every prior student's candid feedback for that class — for dates they never attended. The tutor being reviewed can also read it. `0070` took real care to hide `staff_note` from students; the symmetric protection for `student_feedback` was not made.

**R-06 — The `consents` table has no writer, while the public privacy policy asserts the control.**
`supabase/migrations/0073_consents.sql`; zero references in `src/`

I grepped `src/` for `consents`: the only hits are the policy pages, `CookieNotice.tsx`, a UI caption, and `consents: []` in the mock seed. **Nothing reads or writes the table.** Meanwhile `src/app/(mkt)/privacy/page.tsx:78` states processing occurs with a _"parent or guardian's consent"_ and `:126` offers a **withdraw-consent** right against a record that is never created.

Not technically exploitable — and the table is correctly unforgeable (`0073` defines a `select` policy only, so `authenticated`/`anon` writes are denied and `accepted_at` defaults server-side). It is a compliance-evidence gap: on a DPDP/GCC subject request there is no record of which policy version anyone accepted, whether a guardian consented for a minor, or whether cross-border transfer was agreed. Given this app serves minors, that matters.

---

### LOW (selected — full list in §7)

- **R-07** — `escapeIlike` (`text/ilike.ts:3-5`) escapes `%_` but not a pre-existing backslash, so `\%` becomes a live wildcard at its three direct callers. Neither helper strips `*`, which PostgREST substitutes for `%`. The correct one-liner already exists inline at `subjects.ts:50`.
- **R-08** — `RLS_REQUIRED_TABLES` (`queue-health.ts:26`) — the "is RLS actually on?" alarm — omits **`guardians`** and **`consents`**, the two newest PII tables, both of which rely solely on RLS for their read boundary. Also missing: `capability_overrides`, `persona_assignments`, `class_tutors`, `audit_log`.
- **R-09** — `listGuardians` (`services/guardians.ts:31`) takes no actor and is a service-role read of minors' guardian contacts; safety rests entirely on its single caller. Same shape: `getManagerSession` (`sessions.ts:191`), an unguarded service-role read of `staff_note`.
- **R-10** — `removeGuardian` / `makeGuardianPrimary` do not UUID-validate their ids, so a malformed value throws a bare `Error` past the intended `?error=1` redirect into the error boundary. (No IDOR — every op is scoped by `student_id` _and_ gated by `requireManageableTarget`.)
- **R-11** — `/grading` guards on `viewClasses` while the nav decides on `viewGrading` (`grading/page.tsx:32`), so a denied user reaches the landing page. Bounded: it renders only classes they already access, and the nested tab enforces correctly.
- **R-12** — `mentors_class`, `finance_totals_base`, `set_updated_at` lack `REVOKE ALL ... FROM PUBLIC`, breaking the invariant `0034` established. No live impact (`mentors_class` keys off `auth.uid()`; `finance_totals_base` is INVOKER), but the pattern has an untracked exception. `finance_totals_base` also lacks `SET search_path`.
- **R-13** — `consents_read` hand-rolls its ownership check and drops the `status='active'` predicate that `is_self_active` carries, diverging from every sibling policy. Possibly intentional (subject access survives closure) — but undocumented, and a dangerous template to copy.
- **R-14** — `0075` hard-deletes user-authored exam events with no audit row and no reversal path.
- **R-15** — `route.ts:153-156` swallows `recordResourceAttachmentReplacement` and `supersedePriorResourceAttachments` with bare `.catch(() => {})`, so a failed snapshot/audit write leaves a superseded file with no version history and no `resource.edit` entry.

---

## 3. Findings identified by BOTH audits

| Finding                                                        | Audit A                        | Audit B                                                                           | Corroboration |
| -------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- | ------------- |
| **A-03 fixed for deadline, not for `drive_link`**              | fix-verification agent, conf 9 | I read `0067` and the snapshot's grant block directly                             | 2             |
| **A-05 half-fixed — browser client unhardened**                | fix-verification agent, conf 9 | I confirmed `client.ts` passes only 2 args and nothing else calls `cookieOptions` | 2             |
| **Snapshot omits table REVOKEs**                               | DB agent, HIGH conf 8          | I counted: 24 REVOKE, 0 `ON TABLE`, vs 6 in the chain                             | 2             |
| **A-04 → HIGH; no session revocation exists**                  | open-findings agent            | I grepped: `signOut` appears only in `api/logout/route.ts`                        | 2             |
| **A-07 → HIGH; `manageAttendance` sharpens the contradiction** | open-findings agent            | I read the capability diff and confirmed mentor now holds a write capability      | 2             |
| **`student_feedback` shared column not fixed by 0068**         | DB agent + open-findings agent | I read `writeStudentSessionFeedback` — still no `student_id`                      | 3             |
| **`/admin/history` cross-tier PII**                            | fix-verification agent, conf 8 | I verified no actor arg, no role clamp, email fallback                            | 2             |

---

## 4. Findings MISSED by Claude Security

1. **Build-state verification.** I ran the suite (1154 tests) and typecheck myself rather than accepting the remediation note's "1153 tests · typecheck clean." The note was slightly stale, which is harmless — but the principle is that a claim about the build is not evidence until executed.
2. **R-06 — the `consents` compliance gap.** Requires reading a migration against the _public policy text_ and noticing the promise has no implementation. Outside a code-defect review's frame.
3. **The `enrollments_one_active_student_per_class` correction (§6 #1).** Audit A's feature agent rated the attendance-clear amplification MEDIUM at confidence 6, explicitly noting _"nothing I found enforces 1:1."_ I had already verified the unique partial index exists, which downgrades it.
4. **Operational reachability of R-01.** The DB agent found the missing REVOKEs; establishing that the snapshot is _documented as the restore-drill artifact_ (`operations.md:8`, `README.md:10`, `production-checklist.md:18`) is what turns it from a curiosity into a HIGH.

---

## 5. Findings MISSED by the independent audit

Stated plainly, because accuracy in both directions is the point.

1. **R-02 — the browser cookie gap.** I read `cookie-options.ts`, saw `secure` and the 30-day cap, confirmed both server call sites, and moved on **without asking which client actually writes the cookie first**. Sign-in is client-side; the browser is the primary writer. This is the same failure mode as last audit's `@supabase/ssr` miss — I checked our code and not the boundary it hands off to. Twice now.
2. **R-01 at HIGH.** I raised the snapshot's missing role grants in the first audit but rated it LOW/INFO. The DB agent worked out the _consequence_ — that Supabase's default privileges make the omission actively wrong, not merely incomplete — which is what sets the severity.
3. **R-04 — the `WITH CHECK`/`USING` asymmetry in `0068`.** I read `0068`, judged it a model fix, and noted the weaker `WITH CHECK` as non-exploitable because of the column grant. I did not connect it to R-01, where that column grant disappears.
4. **R-03 — `/admin/history`.** Not on my path; surfaced by the adversarial pass asking "where else does this finding class live?"
5. **R-05 — class-wide feedback reads across enrolment churn.** I verified the 1:1 index and concluded the _write_ side was safe. I did not then check the _read_ side, where the same index is what makes the exposure possible.
6. **B-10 escalation.** The open-findings agent found that a Google-path bind sets `auth_user_id` without `status='active'`, permanently blocking the legitimate owner's password-registration path — a denial-of-account on a pending admin row. I had noted the inconsistency and called it a UX wrinkle.
7. **R-07 — the `escapeIlike` backslash and `*` gaps.** I verified A-12's fix at the `.or()` sites and did not audit the helper itself.

---

## 6. Conflicting assessments

| #   | Subject                                    | Positions                                                                                                                      | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Mentor clearing whole-class attendance** | Feature agent: MEDIUM, conf 6 — `clearAttendanceSession` deletes all rows for class+date and _"nothing I found enforces 1:1."_ | **LOW.** `enrollments_one_active_student_per_class` — a unique partial index on `(class_id) WHERE active` — exists in the snapshot; I verified it directly. A class has at most one active student, so a mentor's authority covers exactly their mentee. **Residual, and real:** `deleteSession` is keyed on class+date only, so it also destroys attendance rows belonging to _previously_ enrolled students. Narrow, unaudited beyond one `attendance.clear` line, and structurally identical to R-05. |
| 2   | **B-12 severity**                          | Original audit: LOW (multi-student overwrite). DB + open-findings agents: INFO/LOW — the audit's premise is unsatisfiable.     | **Original audit was wrong on the mechanism.** The overwrite cannot occur. The finding survives on a different path (enrolment churn) and is promoted to **R-05 (MEDIUM)** on the _read_ side, which nobody had looked at.                                                                                                                                                                                                                                                                               |
| 3   | **A-05 status**                            | Remediation note: Fixed. Both agents: Partial.                                                                                 | **Partial (R-02).** Verified: `createBrowserClient` receives no options.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | **A-03 status**                            | Remediation note: Fixed. Fix-verification agent: Partial.                                                                      | **Partial.** Deadline and INSERT revoke are genuinely done — I confirmed both in the snapshot. `drive_link` remains DB-unvalidated and `UPDATE(is_active)` permits a post-deadline withdraw.                                                                                                                                                                                                                                                                                                             |
| 5   | **R-01 severity**                          | My first audit: LOW/INFO. This run: HIGH.                                                                                      | **HIGH for snapshot-provisioned environments; N/A for production.** Both halves must be stated together — reporting it as a flat HIGH would misrepresent production risk, and as LOW would understate the restore drill.                                                                                                                                                                                                                                                                                 |
| 6   | **Mock mode** (last audit's open conflict) | Previously unresolved.                                                                                                         | **Now resolved in code.** `mock/env.ts:26-28` adds `NODE_ENV === 'production'` with an affirmative `ALLOW_MOCK_AUTH` opt-in, alongside the Vercel check. Genuinely fixed.                                                                                                                                                                                                                                                                                                                                |

---

## 7. Consolidated assessment

### Verdict

**The remediation work is real and of high quality.** Ten of thirteen claimed fixes verified; the three partials are partial for defensible reasons, not hand-waving. `0067`/`0068`/`0070` are exactly the right pattern — each takes a rule that lived only in TypeScript and pushes it into RLS _and_ column grants, which is what the first audit asked for. `A-11` is a textbook fix. The suite is green at 1154 tests, and the new guardians feature is IDOR-free and tier-checked on every mutation.

**It is still not production-ready**, for a smaller and better-understood set of reasons than in August.

The through-line has not changed: **rules enforced only in application code, on an architecture where the browser can reach PostgREST directly.** Three of the four HIGHs are that same shape:

- **A-07** is now _worse_ in an instructive way. Commit `4ab16dd` is the right shape of fix — a narrow `manageAttendance` capability rather than widening `manageClassContent`. But it stopped at TypeScript. The codebase now states, in a commit message and a code comment, that mentor write authority is attendance-only, while `teaches_class()` grants mentors INSERT/UPDATE/**DELETE** on nine more tables. Writing the intent down without enforcing it is a worse position than not having written it down.
- **R-01** is the same failure at the provisioning layer: the privilege model exists in the migration chain and is absent from the artifact documented as "the intended end state."
- **A-04** compounds with A-06 and B-09 into one unrecoverable path, and I confirmed the codebase contains **no session revocation of any kind** outside the user's own logout.

### Roll-up

| Severity | Count | Items                                                                                                             |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| **HIGH** | 4     | **R-01** (new), **A-04** (↑ from MEDIUM), **A-07** (↑ from MEDIUM), **B-02** (UNKNOWN cluster — still unverified) |
| MEDIUM   | 11    | R-02, R-03, R-04, R-05, R-06 (all new); A-09, A-10, A-13, B-01, B-06, B-10 (↑)                                    |
| LOW      | ~18   | R-07…R-15; A-01/A-03/A-14/B-03/B-08 residuals; A-15, B-09, B-11, B-13, CSP `form-action`, CI token scope          |
| INFO     | 2     | B-12 (superseded by R-05), dead `submissions_insert` policy                                                       |

### Fix order

**Blocking:**

1. **R-01** — generate the privilege epilogue into the snapshot; add the CI count assertion. Until then, do not use the snapshot to provision anything, and say so in `operations.md`.
2. **A-07** — split `teaches_class()` into read and write helpers; point the ten write policies at the tutor-only version; add a narrow mentor clause to `attendance_write` and `class_sessions_write` **only**, matching what `4ab16dd` already declares. This makes the DB agree with the code's stated intent.
3. **A-04** — require the current password; drop `email_confirm:true` for user-initiated changes; revoke other sessions after either change; notify the previous address.
4. **R-02** — one line on `createBrowserClient`.
5. **B-02 / §3.1 of the original audit** — still entirely unverified. Walk the Supabase dashboard and record the result.

**Next:** A-09 (make `isClassAdmin` override-aware — it now also defeats a `manageAttendance` deny), A-10, R-03, R-05, R-04, B-01, B-06, R-06.

**Then:** the LOW cluster — R-07 through R-15 are all small, and R-08 (add `guardians`/`consents` to the RLS alarm list) is a two-line change that makes R-01's failure mode observable.

### Two notes for the product owner

**On `manageAttendance`.** The capability now lets a mentor delete a whole session's attendance marks and write the staff-private note. Both are defensible under "correct recording issues," but they arrived as a side effect of a capability swap rather than an explicit decision. Worth a deliberate sign-off.

**On `consents` (R-06).** The privacy policy currently promises a control that has no implementation. Either wire the write path, or soften the wording until it does — the current state is the one combination that carries regulatory risk without carrying the benefit.
