# Cert-Ed Academia — Production Readiness Audit

- **Date:** 2026-08-26 · **Revision 14** (production-readiness series)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `5e23697`, chain head `0079`
- **Method:** every gate executed individually (see §1.1), plus **empirical re-verification of the A-07 fix** against real Postgres 18 and **execution of the restore drill**
- **Scope:** production-readiness for an initial **~100-user** deployment
- **Supersedes:** [Revision 13](./2026-08-25-production-readiness-audit.md)

> **Tree state.** The tree was **clean at `5e23697`** when I started, and the fast gates (typecheck, lint, format, snapshot, audit) ran against exactly that. During the later gates a parallel session began a round-3 security re-audit, adding uncommitted migration `0080`, `tests/unit/services/class-write.test.ts`, and edits to twelve source files. The build, unit, RLS and E2E results below may therefore include some of that in-flight work. The A-07 verification is unaffected — it ran from `supabase/migrations/` at chain head `0079`.

---

## 0. Verdict

**Every gate is green. All ten of them, for the first time in this series.**

|                | R13     | R14         |
| -------------- | ------- | ----------- |
| Gates green    | 9 / 10  | **10 / 10** |
| Unit tests     | 1154    | **1161**    |
| RLS assertions | 34      | **64**      |
| E2E            | 69 / 69 | **69 / 69** |

And the two findings I put my effort into last pass both moved:

**A-07 is closed, and I verified it by re-running the exact probe that breached it.** Migration `0079_split_teaches_class_write.sql` is precisely the fix I recommended — a tutor-only `teaches_class_write()` for write policies, `teaches_class()` retained for reads so mentor oversight survives, and `attendance`/`class_sessions` deliberately left on the read variant to match the `manageAttendance` capability. Every surface I breached in R13 now refuses (§2).

**Better than the fix: the harness now catches this class of defect.** `test-rls.sh` gained explicit A-07 assertions, and `tests/unit/rls-coverage-parity.test.ts` requires every RLS-enabled table to be named in the harness or explicitly exempted, _with an exempt list that may only shrink_. That converts my three-passes-running complaint — new tables shipping without RLS assertions — into something that cannot recur silently.

Three long-carried items also closed: the bundle budget ratcheted 145 → 133 (seven passes), the dark `themeColor` was removed rather than left advertising a theme that does not exist (fifteen passes), and the restore drill became a script I was able to **execute** (§3).

What remains is short, and none of it is a defect in the application:

- **No alarm on the email queue** — still the single thing most likely to fail silently in production.
- **The rebuild snapshot still omits the privilege epilogue** (R-01) — unchanged at 0 `REVOKE ... ON TABLE` against the chain's 6.
- **The OAuth consent-screen step is still missing from the deploy runbook**, though the failure is now self-diagnosing.
- **Six deployment gates** nobody has yet walked.

Overall project health: **9.5 / 10** (was 9.3). This is the strongest state I have measured, and the improvement is in the guards rather than only the code.

---

## 1. Verification results

| Gate                                  | R13           | R14 | Note                                                      |
| ------------------------------------- | ------------- | --- | --------------------------------------------------------- |
| `npm run typecheck`                   | ✅            | ✅  |                                                           |
| `npm run lint`                        | ❌ 1 error    | ✅  | **Fixed exactly as recommended** — `useSyncExternalStore` |
| `npm run format:check`                | ✅            | ✅  |                                                           |
| `npx vitest run`                      | ✅ 1154       | ✅  | **1161 passed / 153 files**                               |
| `npm run build` (clean `.next`)       | ✅            | ✅  | manifest guard OK across 25 pages                         |
| `npm run check:bundle`                | ✅ 145 budget | ✅  | **127.4 / 133 KB** — budget ratcheted                     |
| `npm run check:snapshot`              | ✅            | ✅  | current at `0079`                                         |
| `scripts/test-rls.sh`                 | ✅ 34         | ✅  | **64 passed, 0 failed** (+30)                             |
| `npm audit --omit=dev`                | ✅ 0          | ✅  | 0                                                         |
| `npx playwright test`                 | ✅ 69         | ✅  | **69 passed, 0 failed**                                   |
| `scripts/restore-drill.sh --rehearse` | —             | ✅  | **5 passed, 0 failed**, RTO 1s (§3)                       |

### 1.1 The chained-run lesson, applied

R13 recorded that chaining these gates on this machine produces false failures. I ran them individually this pass, and the one that still misfired proves the point: the RLS harness's **first** run reported `23 passed, 41 failed`, with every failure reading `database "certed_rls_test" does not exist` — a provisioning race, not an assertion failure. Re-run on its own: **64 passed, 0 failed**.

That is now three consecutive passes where a first attempt on this machine produced a scarier number than the codebase deserved. The rule holds: **run these one at a time, and treat any failure whose message names infrastructure rather than an assertion as suspect until re-run.**

---

## 2. A-07 — closed, and verified by re-running the breach

R13 demonstrated that a profile holding _only_ a student-scoped `mentor` persona could write class content through RLS. I rebuilt the same database at chain head `0079` and ran the same probe.

**Then (R13, chain head 0076):**

```
mentors_class       -> true
teaches_class       -> true
ASSIGNMENT INSERT AS MENTOR: SUCCEEDED (count=1)
RESOURCE INSERT AS MENTOR: SUCCEEDED
RESOURCE DELETE AS MENTOR: SUCCEEDED
```

**Now (R14, chain head 0079):**

```
mentors_class       -> true      ← oversight read preserved
teaches_class(read) -> true      ← oversight read preserved
teaches_class_write -> false     ← new
ERROR:  new row violates row-level security policy for table "assignments"
```

Every surface, re-tested:

| Surface                     | R13             | R14                                                    |
| --------------------------- | --------------- | ------------------------------------------------------ |
| `assignments` INSERT        | ✅ succeeded    | ❌ **blocked by RLS**                                  |
| `resources` INSERT / DELETE | ✅ succeeded    | ❌ **blocked by RLS**                                  |
| `announcements` INSERT      | (policy shared) | ❌ **blocked by RLS**                                  |
| `calendar_events` INSERT    | (policy shared) | ❌ **blocked by RLS**                                  |
| `meet_links` INSERT         | (policy shared) | ❌ **blocked by RLS**                                  |
| `attendance` INSERT         | —               | ✅ **allowed — intended**, matching `manageAttendance` |

The carve-out is the part worth crediting. The migration's comment explains it: `attendance_write` and `class_sessions_write` stay on `teaches_class()` _on purpose_, because editing attendance is exactly the authority `4ab16dd` declared. The fix distinguishes "the database disagreed with the code" from "mentors should have no write at all", which is the harder and more correct reading.

**And the guard that was missing now exists.** `test-rls.sh` contains assertions named `A-07: mentor CANNOT insert assignment in mentee class` (and resource, and announcement). R13's diagnosis was that this survived three audits because every guard pointed at the application layer while the gap was in the database. That is no longer true.

### 2.1 One false positive of my own, caught

My first sweep reported `calendar_events => *** ALLOWED ***`. It was wrong: my bulk-probe script classified results by grepping the _last_ line for "error", and the actual failure — a bad column name in my own INSERT — appeared earlier. I caught it by checking whether the row had actually landed (`0 rows`), then read the live policy (`calendar_events_write` correctly uses `teaches_class_write`), then re-ran with correct columns and got a clean RLS rejection.

Worth recording because the check that caught it was cheap and generic: **when a probe claims a write succeeded, confirm the row exists.**

---

## 3. The restore drill — executed

FIND-35 ("backup/DR documented; restore drill never performed") has been carried since revision 5. It is now `scripts/restore-drill.sh`, and I ran it:

```
== [rehearse] building a production-like DB from the migration chain ==
== [rehearse] pg_dump (simulated backup) -> drop -> restore ==
== verifying restore: certed_restore_drill ==
  ok   schema: guardians table (0076)
  ok   schema: assignments.type column (0071)
  ok   schema: rls_disabled_tables fn (0069)
  ok   data: at least one receipt present
  ok   data: every receipt total reconciles
== restore + verify took 1s (RTO signal) ==
== DRILL RESULT: 5 passed, 0 failed ==
```

Two things this gets right that a checklist item never would: it verifies the **financial system-of-record reconciles** after restore rather than just that tables exist, and it prints an **RTO signal**.

**What it does not yet establish.** This is the `--rehearse` path — build, dump, drop, restore, verify, all locally. The real drill is restoring an actual Supabase backup into a scratch project, and that remains **Not verified**. The script says so itself, and it flags the detail most restore drills miss: _custodial attachments live outside the database backup_ and must be confirmed separately from Google Drive. So B7 moves from "never performed" to **"mechanized and rehearsed; not yet run against a real backup."**

---

## 4. R13 findings — status

### Closed

| R13 finding                                     | Status                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **§2** Lint red (`CookieNotice`)                | ✅ Fixed with `useSyncExternalStore` — the recommended approach, not a suppression                                                             |
| **§3** 🔴 A-07 mentor write at the RLS boundary | ✅ **Fixed (`0079`) and verified empirically** (§2), plus RLS assertions                                                                       |
| **§5** New tables ship without RLS assertions   | ✅ **Fixed and made mechanical** — 64 assertions, plus `rls-coverage-parity.test.ts` with a shrink-only exempt list                            |
| **§5** `invalid_grant` discarded                | ✅ Fixed, and the message names the cause: _"refresh token expired or revoked — re-capture it; set the OAuth consent screen to In production"_ |
| **M5** Bundle budget 145 → 133                  | ✅ Ratcheted (seven passes)                                                                                                                    |
| **FIND-29** No dark mode                        | ✅ **Closed the other way** — the dark `themeColor` was removed, so the app no longer advertises a theme it lacks (fifteen passes)             |
| **NEW-28** Hook executability                   | ✅ Now guarded by `scripts/check-hooks-executable.sh`                                                                                          |
| **B7** Restore drill                            | ⚠️ → ✅ Mechanized and rehearsed (§3); real-backup drill still outstanding                                                                     |

### Still open

| Finding                                                  | Severity  | Note                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§5** No queue-depth / failed-attachment alarm          | 🟠 High   | Unchanged, and now the **highest-value remaining item**. With the drain cron deliberately out of `vercel.json` (Hobby limits), nothing would tell you notification email had silently stopped. ~30 minutes in the keepalive cron, which already runs authenticated and daily.                                              |
| **§4 / R-01** Snapshot omits the privilege epilogue      | 🟡 Medium | Unchanged: snapshot **0** `REVOKE ... ON TABLE`, chain **6**. My R13 measurement stands — provisioning from the snapshot loses the grant boundary (`profiles` regains UPDATE, `submissions` regains INSERT/UPDATE), though RLS blocked both attacks I tried. Fix by generating the epilogue and asserting the count in CI. |
| **§5** OAuth consent-screen step absent from the runbook | 🟡 Medium | Downgraded from High. The _diagnosis_ is now excellent — the thrown error names Testing mode and the 7-day expiry. But `deployment.md §6` still does not tell you to set the consent screen to `In production` **before** capturing the token, so the failure is well-explained rather than prevented. One line.           |
| **R10 §5.3** Unbounded analytics reads                   | 🟡 Medium | Unchanged                                                                                                                                                                                                                                                                                                                  |
| **R10 §9** `design_assets/` — 14 binaries, 19 MB         | 🟢 Low    | Unchanged                                                                                                                                                                                                                                                                                                                  |
| **R11 §4.3** `EXTENSION_MIME` executable-type note       | 🟢 Low    | Unchanged                                                                                                                                                                                                                                                                                                                  |

### Deployment gates — unchanged, still unverifiable

B2 (Supabase Pro + backups), B3 (custom SMTP → Resend), B4 (Vercel Pro), B5 (region `bom1`), B6 (preview/production separation), plus the re-audit's **B-02** Supabase auth dashboard cluster. All documented; none confirmed. **These are now the largest block of unknowns in the project** — every code-side finding I have raised across five passes is either closed or Low/Medium, while these six remain untouched.

---

## 5. Database

**41 tables, chain `0001`–`0079`** committed (`0080` uncommitted in the parallel session's tree), snapshot current, **64 RLS assertions passing**.

New since R13: `0077` (feedback check + function grants), `0078` (mentee notes), `0079` (the A-07 split). I walked the full chain into a fresh database with `ON_ERROR_STOP=1` and it applied cleanly at `0079`.

Capacity is unchanged: the new tables are per-relationship rows (`mentee_notes`, `guardians`, `consents`), all small. **Year-1 remains ≈ 145 MB against the 500 MB Free-tier limit**, with `audit_log` capped at 24 months. Database size is still not a reason to upgrade; **backups still are** — and B2 is still unconfirmed.

---

## 6. Prioritised plan

The code-side list is now short enough to finish in a day.

### Before production

| #   | Action                                                                                     | Finding | Effort |
| --- | ------------------------------------------------------------------------------------------ | ------- | ------ |
| 1   | **Queue-depth + failed-attachment alarm** in the keepalive cron                            | §4      | 30 min |
| 2   | **Wire the drain + reconcile jobs** on the production project; verify one run of each      | carried | 30 min |
| 3   | Add the OAuth consent-screen step to `deployment.md §6`                                    | §4      | 10 min |
| 4   | **Set the consent screen to `In production`**; re-capture the refresh token                | §4      | 15 min |
| 5   | Generate the privilege epilogue into the snapshot + CI count assertion                     | §4      | 2 h    |
| 6   | **Supabase Pro — backups + PITR on**                                                       | B2      | 15 min |
| 7   | **Run the real restore drill** against a Supabase backup, including a Drive attachment     | §3 / B7 | 2 h    |
| 8   | **Auth email → custom SMTP (Resend)**; receive a real reset                                | B3      | 30 min |
| 9   | **Vercel Pro**; confirm region `bom1`                                                      | B4/B5   | 30 min |
| 10  | Preview/production separation                                                              | B6      | 2 h    |
| 11  | **Walk the Supabase auth dashboard**; record every setting                                 | B-02    | 30 min |
| 12  | Smoke-test a PDF render and a full Drive upload/download/delete on deployed infrastructure | —       | 1 h    |

Items 6–12 are environment work, not engineering. **That is the whole remaining critical path.**

### Soon after

Bound the analytics reads; `git rm -r design_assets`; the `EXTENSION_MIME` note; whatever the parallel session's round-3 re-audit and `0080` surface.

---

## 7. Scorecard

| Dimension            |   R13   |   R14   | Justification                                                                                                                                                                                                                                                      |
| -------------------- | :-----: | :-----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture         |    9    |  **9**  | Absorbed three more migrations and a security fix without strain                                                                                                                                                                                                   |
| Security             |    8    | **10**  | +2: A-07 closed **and** verified by re-running the breach; the fix distinguishes intended mentor authority from leaked authority; RLS assertions now cover it                                                                                                      |
| Maintainability      |    9    | **10**  | +1: three independent security audits in six days, each acted on; findings turned into mechanical guards rather than checklist items                                                                                                                               |
| Performance          |    9    |  **9**  | Bundle ratcheted to a tighter budget and still 5.6 KB under                                                                                                                                                                                                        |
| Scalability          |    9    |  **9**  | Still no queue alarm — the one structural gap left                                                                                                                                                                                                                 |
| Documentation        |   10    | **10**  | Restore runbook now executable                                                                                                                                                                                                                                     |
| Testing              |    9    | **10**  | +1: **64 RLS assertions** (was 34), a coverage-parity gate that cannot silently regress, 1161 unit tests, 69/69 E2E                                                                                                                                                |
| Developer Experience |   10    | **10**  | Hook executability now guarded; drill is one command                                                                                                                                                                                                               |
| User Experience      |    9    |  **9**  | Dark `themeColor` removed — honest rather than aspirational                                                                                                                                                                                                        |
| Code Quality         |    9    | **10**  | +1: all ten gates green                                                                                                                                                                                                                                            |
| **Overall**          | **9.3** | **9.5** | Best-measured state. Every code-side finding from five passes is now closed or Low/Medium, the two I invested in are both resolved, and the fixes were made mechanical rather than manual. What remains is almost entirely environment work nobody has walked yet. |

---

## 8. What I got wrong this pass

- **I reported `calendar_events` as still writable by a mentor.** It was not — my bulk probe classified results by grepping only the last output line, and my own bad column name masked the real rejection. Caught by verifying the row had not landed, then reading the live policy, then re-running correctly (§2.1).
- **My first RLS harness run reported 41 failures.** Infrastructure, not assertions — the test database failed to provision. Re-run alone: 64/64. Third consecutive pass with a self-inflicted scare on this machine (§1.1).

Both were caught by the same habit and it is worth naming: **when a result is surprising, confirm the underlying state directly before writing it down.** In both cases the confirming check took under a minute.

---

_Revision 14 performed 2026-08-26 against `feature/cert-ed-academia-app` @ `5e23697` (chain head `0079`), with each gate executed individually, a hand-walked migration chain, an empirical re-test of the R13 A-07 breach, and an executed restore-drill rehearsal. All probe databases were dropped; no application code was modified — the only file written is this report. Items that could not be verified from the repository — Supabase plan, region, backups, SMTP and auth dashboard settings; Vercel plan; the Google OAuth consent-screen publishing status; whether the drain/reconcile jobs are scheduled; and a restore from a real Supabase backup — are labelled_ **Not verified** _in place._
