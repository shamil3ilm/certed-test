# Cert-Ed Academia — Production Readiness Audit

- **Date:** 2026-08-26 · **Revision 15** (production-readiness series)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `fa11762`, chain head `0082` · **working tree clean**
- **Method:** every gate executed individually, plus **five database experiments against real Postgres 18** that verify one claimed fix does not work and reproduce the fix that does
- **Scope:** production-readiness for an initial **~100-user** deployment
- **Supersedes:** [Revision 14](./2026-08-26-production-readiness-audit.md)

---

## 0. Verdict

**Two of my three remaining findings are closed, one is closed on paper but does not execute, and one new gap keeps a spec red.**

The queue-health alarm and the OAuth consent-screen runbook step both landed, and both are better than what I asked for. But the headline of this pass is a fix that looks right, passes any text-based check, and **does nothing when run**:

> **The snapshot privilege epilogue (R-01) never executes.** All five `REVOKE` statements fail with `relation "…" does not exist`. pg_dump sets an **empty `search_path`** at line 28 and schema-qualifies every one of its own statements (`public.submissions`); the hand-added epilogue at lines 4430–4434 uses **unqualified** names, so nothing resolves. A snapshot-provisioned database still grants `authenticated` the exact five privileges the chain revokes — including `profiles UPDATE` and `submissions INSERT/UPDATE`, the three I measured as the gap in R13.

I verified this three ways: the errors on application, a privilege diff against a chain-provisioned database (five differences), and the corrected one-word-per-line fix (five differences → zero).

There is a lesson in it worth more than the bug. In R13 I recommended _"add a CI assertion that the snapshot's `REVOKE ... ON TABLE` count matches the chain's."_ **That assertion would have passed.** The snapshot contains all five REVOKEs as text; they simply do not run. My recommended guard would have certified a broken fix. The check that works is the one I actually ran — provision both ways and diff effective privileges.

The second new finding is smaller and is a testing gap, not a product one: the **mock harness's `teaches_class` has no mentor branch**, so E2E cannot validate the mentor calendar authority that migration `0082` deliberately introduced. One spec is red for that reason.

Overall project health: **9.4 / 10** (was 9.5). Engineering quality continues to rise; the dip is one red spec and one non-functional fix.

---

## 1. Verification results

| Gate                            | R14     | R15 | Note                              |
| ------------------------------- | ------- | --- | --------------------------------- |
| `npm run typecheck`             | ✅      | ✅  |                                   |
| `npm run lint`                  | ✅      | ✅  |                                   |
| `npm run format:check`          | ✅      | ✅  |                                   |
| `npx vitest run`                | ✅ 1161 | ✅  | **1179 passed / 157 files**       |
| `npm run build` (clean `.next`) | ✅      | ✅  | manifest guard OK across 25 pages |
| `npm run check:bundle`          | ✅      | ✅  | 127.4 / 133 KB                    |
| `npm run check:snapshot`        | ✅      | ✅  | current at `0082`                 |
| `scripts/test-rls.sh`           | ✅ 64   | ✅  | **67 passed, 0 failed**           |
| `npm audit --omit=dev`          | ✅ 0    | ✅  | 0                                 |
| `npx playwright test`           | ✅ 69   | ❌  | **1 failed / 68 passed** — §3     |

Every gate ran individually, per the rule established in R13/R14. **No false alarms this pass** — the first run of each gate was also its final result, which is the first time that has happened.

---

## 2. 🟠 HIGH — the snapshot privilege epilogue does not execute

### What was added

`5f85d00` added a privilege epilogue to `supabase/rebuild/0000_full_rebuild.sql`, closing R-01 on its face. The snapshot went from **0** to **5** `REVOKE ... ON TABLE` statements, at lines 4430–4434, after every object is created:

```sql
-- Table privilege epilogue (R-01): re-apply the migrations' table-level REVOKEs of
-- Supabase default grants, which a schema-only pg_dump drops. Extracted from the chain.
revoke insert on table submissions from authenticated;
revoke insert, update on table submissions from authenticated;
revoke select on table class_sessions from authenticated;
revoke update on table notifications from anon, authenticated;
revoke update on table profiles from authenticated;
```

The intent, placement and content are all correct.

### What happens when you run it

```
psql:supabase/rebuild/0000_full_rebuild.sql:4430: ERROR:  relation "submissions" does not exist
psql:supabase/rebuild/0000_full_rebuild.sql:4431: ERROR:  relation "submissions" does not exist
psql:supabase/rebuild/0000_full_rebuild.sql:4432: ERROR:  relation "class_sessions" does not exist
psql:supabase/rebuild/0000_full_rebuild.sql:4433: ERROR:  relation "notifications" does not exist
psql:supabase/rebuild/0000_full_rebuild.sql:4434: ERROR:  relation "profiles" does not exist
```

**All five fail.** The mechanism is at line 28 of the same file:

```sql
SELECT pg_catalog.set_config('search_path', '', false);
```

pg_dump deliberately empties `search_path` and schema-qualifies everything it emits — `CREATE TABLE public.pending_emails`, and so on. The hand-added epilogue uses bare table names, which cannot resolve against an empty search path.

### The consequence, measured

Two Supabase-faithful databases — default privileges granting `authenticated` table DML _before_ any objects exist, as Supabase does — one provisioned from the chain, one from the snapshot. Diffing `authenticated`'s effective table privileges:

| Privilege the chain revokes | Snapshot-provisioned |
| --------------------------- | -------------------- |
| `profiles UPDATE`           | **still granted**    |
| `submissions INSERT`        | **still granted**    |
| `submissions UPDATE`        | **still granted**    |
| `class_sessions SELECT`     | **still granted**    |
| `notifications UPDATE`      | **still granted**    |

This is byte-for-byte the R13 measurement. **R-01 is unchanged in effect.**

### The fix, verified

One word per line:

```sql
revoke insert, update on table public.submissions   from authenticated;
revoke select        on table public.class_sessions from authenticated;
revoke update        on table public.notifications  from anon, authenticated;
revoke update        on table public.profiles       from authenticated;
```

Applied to the snapshot-provisioned database, the five divergent privileges went to **zero** — an exact match with the chain. (Equivalently, prepend `SET search_path = public;` to the epilogue; qualification is the more robust of the two, since it cannot be undone by a later `set_config`.)

### Severity, stated carefully

I rated R-01 **MEDIUM** in R13 and I stand by that: on both attack paths I tested there, RLS still blocked the write, so this is defence-in-depth dropping from two layers to one rather than an open door. Nothing about that has changed.

What has changed is that the project now believes this is fixed. `operations.md` and `production-checklist.md` reference the snapshot as a provisioning artefact, and a reviewer grepping for `REVOKE ON TABLE` finds five. **A silently non-functional fix is worse than a known-open finding**, which is why I am raising it to HIGH for action while leaving the underlying exposure at MEDIUM.

### The guard that would actually catch it

My R13 recommendation — assert the REVOKE _count_ matches — **would have passed on this snapshot**. Text is not behaviour. The working check is roughly ten lines and is what I ran:

1. Provision one scratch database from `supabase/migrations/*.sql`, another from the snapshot, both with Supabase-style default privileges applied first.
2. `diff` the two `information_schema.role_table_grants` listings for `authenticated`.
3. Fail if they differ.

That belongs beside `check-snapshot-freshness.sh`, and it would also catch the _next_ divergence, not just this one. It is a natural extension of `scripts/restore-drill.sh`, which already provisions and verifies a database but checks schema and data rather than privileges.

---

## 3. 🟠 MEDIUM — the mock harness cannot express mentor calendar authority

```
api -- a mentor CAN create an event for a mentee class, but not a global one
  Expected: 201    Received: 403
```

**The product is right and the spec is right; the mock is stale.**

`0082_mentor_calendar_write.sql` plus `01a0091` deliberately grant a mentor calendar-write authority on a mentee's class — a narrower, well-argued companion to the `0079` A-07 split. The code says so:

```ts
// Calendar/timetable WRITE scope: admin, a tutor of the class, OR a mentor of a student
// enrolled in it. Mirrors the Postgres `teaches_class` scope that calendar_events_write /
// timetable_slots_write gate on (0082) - deliberately BROADER than canWriteClass ...
export async function canWriteCalendar(profile: Profile, classId: string | null): Promise<boolean> {
  const { isAdmin } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  if (classId == null) return false
  return teachesClass(classId) // the READ scope — includes the mentor branch
}
```

In real Postgres, `teaches_class()` ends `or mentors_class(p_class_id)`, so this returns true for a mentor. In the mock it does not:

```ts
// teaches_class_write (0079) is the tutor-only WRITE scope; the mock's teaches_class
// is already a plain class_tutors lookup (no mentor branch), so both resolve the same
// tutor-of-class way here.
if (fn === 'teaches_class' || fn === 'teaches_class_write' || fn === 'is_enrolled') {
```

That comment was accurate before `0082` and is now the bug: collapsing `teaches_class` and `teaches_class_write` to one tutor-only lookup is exactly the distinction `0079`/`0082` created. The mentor gets `false`, `canWriteCalendar` refuses, and the API returns 403.

**This is the NEW-22 pattern again** (R9: `exchange_rates` missing from the mock silently disabled admin-dashboard E2E). A migration changed a function the app reads on a tested path, and the mock did not follow.

**Fix:** give the mock's `teaches_class` the mentor branch — tutor-of-class **OR** mentor of a student enrolled in it — while `teaches_class_write` stays tutor-only. I confirmed the seed already supports it: Maya (`IDS.mentor`) mentors `IDS.student`, who is enrolled in `IDS.math`, which is the class the spec uses. The two functions then diverge in the mock exactly as they do in Postgres, and the spec passes.

**Worth noting the guard did its job.** `scoping.pw.ts` was updated in the same batch to assert the _new_ behaviour, so the suite is red rather than silently passing a stale assertion — the failure is informative. The gap is mock fidelity, not test discipline.

---

## 4. R14 findings — status

### Closed

| R14 finding                                              | Status                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **§4** No queue-depth / failed-attachment alarm          | ✅ **Closed, better than recommended.** `lib/services/queue-health.ts` alarms on queue depth, oldest-pending age, terminal send failures **and** failed attachments — plus **RLS-disabled tables**, turning "are the security migrations applied?" into an observable signal. Piggy-backed on the one cron Hobby allows. The reasoning is right too: _"NOT an email alert — the email queue itself may be the thing that's broken."_ |
| **§4** OAuth consent-screen step absent from the runbook | ✅ **Closed.** `deployment.md §6` step 2 now says to set the consent screen to `In production` **before** capturing the token, explains the 7-day Testing-mode expiry, names the `invalid_grant` symptom, and adds the **Internal user type** alternative I had not thought of.                                                                                                                                                      |
| **§4 / R-01** Snapshot privilege epilogue                | ⚠️ **Attempted; non-functional** — see §2                                                                                                                                                                                                                                                                                                                                                                                            |

### Still open

| Finding                                            | Severity  | Note                                                                                                                                                                                                    |
| -------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R10 §5.3** Unbounded analytics reads             | 🟡 Medium | Unchanged. `sumResourceDownloads()` still fetches every active resource row to sum in JS; the attendance/session reads still have no date bound. Correct and cheap at current volumes; a year-two item. |
| **R10 §9** `design_assets/` — 14 binaries, 19 MB   | 🟢 Low    | Unchanged                                                                                                                                                                                               |
| **R11 §4.3** `EXTENSION_MIME` executable-type note | 🟢 Low    | Unchanged                                                                                                                                                                                               |

### Deployment gates — the whole remaining critical path

B2 (Supabase Pro + backups), B3 (custom SMTP → Resend), B4 (Vercel Pro), B5 (region `bom1`), B6 (preview/production separation), the **B-02** Supabase auth dashboard cluster, and a **real restore drill against an actual Supabase backup** all remain **Not verified**.

Every one is documented; none is confirmed. With §2 and §3 fixed, **these become the only things standing between this codebase and production**, and none of them is engineering work.

---

## 5. Database

**43 tables, chain `0001`–`0082`**, snapshot current, **67 RLS assertions passing** (was 64).

New since R14: `0080` (write-scope grant + self-update check), `0081` (submission deadline + drive-link scheme at the DB boundary), `0082` (mentor calendar write). The pattern in `0081` is the one worth repeating — taking a rule that lived only in TypeScript and mirroring it in RLS.

Capacity is unchanged: **year-1 ≈ 145 MB against the 500 MB Free-tier limit**, `audit_log` capped at 24 months. Database size remains a non-issue; **backups (B2) remain the reason to upgrade**, and remain unconfirmed.

---

## 6. Prioritised plan

### Before production

| #   | Action                                                                                                       | Finding | Effort |
| --- | ------------------------------------------------------------------------------------------------------------ | ------- | ------ |
| 1   | **Schema-qualify the snapshot privilege epilogue** (`public.x`) and re-verify by diffing privileges          | §2      | 15 min |
| 2   | **Add the privilege-parity check to CI** — provision both ways, diff `role_table_grants`, fail on difference | §2      | 1 h    |
| 3   | **Give the mock's `teaches_class` the mentor branch**; keep `teaches_class_write` tutor-only                 | §3      | 20 min |
| 4   | **Supabase Pro — backups + PITR on**                                                                         | B2      | 15 min |
| 5   | **Run the real restore drill** against a Supabase backup, including a Drive attachment                       | B7      | 2 h    |
| 6   | **Auth email → custom SMTP (Resend)**; receive a real reset                                                  | B3      | 30 min |
| 7   | **Vercel Pro**; confirm region `bom1`                                                                        | B4/B5   | 30 min |
| 8   | **Wire the drain + reconcile jobs**; verify one run of each                                                  | carried | 30 min |
| 9   | Preview/production separation                                                                                | B6      | 2 h    |
| 10  | **Walk the Supabase auth dashboard**; record every setting                                                   | B-02    | 30 min |
| 11  | Smoke-test a PDF render and a full Drive upload/download/delete on deployed infrastructure                   | —       | 1 h    |

Items 1–3 are about ninety minutes of engineering. Everything after is environment work.

### Soon after

Bound the analytics reads; `git rm -r design_assets`; the `EXTENSION_MIME` note.

---

## 7. Scorecard

| Dimension            |   R14   |   R15   | Justification                                                                                                                                                                     |
| -------------------- | :-----: | :-----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture         |    9    |  **9**  | `0082`'s narrow mentor calendar grant is the right shape — a specific authority, argued in the migration                                                                          |
| Security             |   10    |  **9**  | −1: R-01's fix does not execute, and the project believes it does                                                                                                                 |
| Maintainability      |   10    | **10**  | Fixes keep being turned into guards; runbook steps are specific enough to follow cold                                                                                             |
| Performance          |    9    |  **9**  | Bundle flat under the tightened budget                                                                                                                                            |
| Scalability          |    9    | **10**  | +1: the queue-health alarm closes the last structural gap — and covers more than I asked for                                                                                      |
| Documentation        |   10    | **10**  | The OAuth step is better written than my finding                                                                                                                                  |
| Testing              |   10    |  **9**  | −1: mock fidelity lags a migration again (the NEW-22 pattern), leaving a spec red                                                                                                 |
| Developer Experience |   10    | **10**  | Every gate first-run-clean this pass                                                                                                                                              |
| User Experience      |    9    |  **9**  | Unchanged                                                                                                                                                                         |
| Code Quality         |   10    | **10**  | Nine of ten gates green; the tenth is a harness gap                                                                                                                               |
| **Overall**          | **9.5** | **9.4** | Two findings closed better than specified. Held back by a fix that passes inspection and fails execution, and by a mock that cannot express a distinction the database now makes. |

---

## 8. What this pass taught me about my own recommendation

R13 ended with: _"generate the privilege epilogue into the snapshot and add a CI assertion that its `REVOKE ... ON TABLE` count matches the chain's."_

The epilogue was generated. The count now matches. **And the privileges are unchanged**, because the statements error at runtime. Had the CI assertion I proposed been implemented, it would have gone green over a broken fix and I would have had less reason to re-check it this pass.

The generalisation is not subtle but it is easy to violate under time pressure: **assert the effect, not the text.** A count of statements, a grep for a function name, a check that a file exists — all of these certify that someone wrote something, never that it works. Every finding I have closed by execution in this series (A-07 in R14, the restore drill, this) held up; the one I proposed to close by counting would not have.

I also want to note the one place I was wrong in the _other_ direction: I have twice suspected the migration chain or the build of being broken when the cause was my own concurrency. This pass I ran everything individually and every gate was first-run-clean. The discipline works.

---

_Revision 15 performed 2026-08-26 against `feature/cert-ed-academia-app` @ `fa11762` (chain head `0082`), working tree clean, with each gate executed individually, a hand-walked migration chain, and five Supabase-faithful database experiments on real Postgres 18 — including a verified reproduction of the corrected privilege epilogue. All probe databases were dropped; no application code was modified. Items that could not be verified from the repository — Supabase plan, region, backups, SMTP and auth dashboard settings; Vercel plan; the Google OAuth consent-screen publishing status; whether the drain/reconcile jobs are scheduled; and a restore from a real Supabase backup — are labelled_ **Not verified** _in place._
