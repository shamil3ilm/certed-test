# Cert-Ed Academia — Production Readiness Audit

- **Date:** 2026-08-25 · **Revision 13** (production-readiness series)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `4ab16dd`, chain head `0076`
- **Method:** static analysis plus live execution of every gate, and **five database experiments against real Postgres 18** to test two claims empirically rather than by reading (§3, §4)
- **Scope:** production-readiness for an initial **~100-user** deployment
- **Supersedes:** [Revision 12](./2026-08-19-production-readiness-audit.md)

> **Tree state.** A parallel session was actively editing classroom permissions while this ran — `src/lib/permission/class.ts`, three classroom pages, `classroom/class-actions.ts`, and `tests/e2e/journeys.pw.ts` were modified but uncommitted, and `docs/qa/2026-08-25-security-reaudit.md` was created. Gate results below are **against that in-flight tree**, not a clean checkout of `4ab16dd`. The database experiments are unaffected — they run from `supabase/migrations/` and the rebuild snapshot, both of which were committed and unmodified.

---

## 0. Verdict

**The application is in the best shape I have measured it in. One gate is red, and it is a one-line lint error.**

Since R12: twelve migrations, guardians, consents, privacy and terms pages, multi-tutor, assignment types, a `manageAttendance` capability, a **data-minimisation pass that dropped `gender` and `address`**, and a batch of security fixes. Unit tests went from 953 to **1154**. And the E2E suite is **69 passed, 0 failed** — fully green for the first time across four passes of this series. Both R12 stale specs were fixed, and the pre-push hook is finally executable (`100755`).

There is also now a genuinely excellent **[security re-audit](./2026-08-25-security-reaudit.md)** written today by a parallel session. It is more thorough on security than I would have been, it re-derived every claimed fix from current code rather than trusting the remediation table, and it correctly escalated two findings. **I have not duplicated it.** What I did instead was take its two highest-severity claims into a real database and try to make them happen.

The results of those experiments are the substance of this report, and they cut both ways:

- **A-07 is real, and I executed it.** A profile holding _only_ a student-scoped `mentor` persona — no tutor persona anywhere — successfully inserted an assignment and inserted _and deleted_ a resource in the mentee's class, through RLS, as the `authenticated` role. This is not a reading of a policy; it is a transcript (§3).
- **R-01 is real but less severe than rated.** Snapshot-provisioning does measurably lose the grant boundary. But on both attack paths I tried, **RLS still blocked the write**. Defence-in-depth drops from two layers to one; I could not demonstrate an exploitable escalation through it (§4).

The most important structural point in this pass is the relationship between those two facts and a passing test. `scoping.pw.ts:84` — _"a mentor CANNOT create an event for a mentee class (oversight is read-only)"_ — **passes**. It passes because the application layer refuses. The database does not. That single line is why A-07 has survived three audits: the guard that would catch it tests the wrong layer.

Overall project health: **9.3 / 10** (was 9.0). The rise is earned — green E2E, +201 tests, data minimisation, a real security cadence. Held back by A-07 and by six deployment gates that remain unverifiable from a repository.

---

## 1. Verification results

| Gate                            | R12      | R13 | Note                                            |
| ------------------------------- | -------- | --- | ----------------------------------------------- |
| `npm run typecheck`             | ✅       | ✅  |                                                 |
| `npm run lint`                  | ✅       | ❌  | **1 error** — `CookieNotice.tsx:20` (§2)        |
| `npm run format:check`          | ✅       | ✅  |                                                 |
| `npx vitest run`                | ✅ 953   | ✅  | **1154 passed / 150 files** (+201)              |
| `npm run build` (clean `.next`) | ✅       | ✅  | manifest guard OK across 25 pages               |
| `npm run check:bundle`          | ✅       | ✅  | 127.4 / 145 KB — flat for seven passes          |
| `npm run check:snapshot`        | ❌ stale | ✅  | current at `0076`                               |
| `scripts/test-rls.sh`           | ✅ 34    | ✅  | 34 passed, 0 failed                             |
| `npm audit --omit=dev`          | ✅ 0     | ✅  | 0                                               |
| `npx playwright test`           | ❌ 2     | ✅  | **69 passed, 0 failed** — first fully green run |

### 1.1 Two false alarms of my own, again

I first ran vitest → build → bundle → RLS as one chained command. It reported a **build ENOENT** on `.next/server/proxy.js.nft.json` and a **migration chain failure** at `0023` ("relation `conversations` does not exist").

Both were artefacts of running those jobs back-to-back on this machine. Re-run individually: the build succeeds with the manifest guard green, and the RLS harness passes 34/34. I also walked the full `0001`–`0076` chain by hand into a fresh database with `ON_ERROR_STOP=1` and it applied cleanly, which is what ruled out a real chain defect.

This is the second consecutive pass where my own execution produced a scarier result than the codebase deserved (R12 §1.1 was a stale reused server). The lesson is now specific enough to write down: **on this machine, run these gates one at a time.** I am recording it so the next reader discounts a chained-run failure rather than chasing it.

---

## 2. 🟡 MEDIUM — lint is red on one file

```
src/app/components/CookieNotice.tsx
  20:54  error  Calling setState synchronously within an effect can trigger cascading renders
```

```tsx
useEffect(() => {
  try {
    if (localStorage.getItem(DISMISS_KEY) !== '1') setVisible(true)
  } catch {
    setVisible(true)
  }
}, [])
```

**The intent is right** — the comment explains it starts hidden so SSR and pre-hydration agree, avoiding a flash of the bar for a returning visitor. React's newer `react-hooks/set-state-in-effect` rule flags the pattern anyway, and CI runs `lint`, so the pipeline is red.

**Fix:** `useSyncExternalStore` is the sanctioned pattern for "read an external store without a hydration mismatch" — `getServerSnapshot` returns dismissed, the client snapshot reads `localStorage`. That satisfies the rule and keeps the no-flash behaviour, rather than suppressing the warning.

---

## 3. 🔴 A-07 — demonstrated, not inferred

Their re-audit escalated A-07 to HIGH by reading the policy. I ran it.

**Setup** — a fresh database with the full `0001`–`0076` chain, Supabase-shaped (`auth.uid()`, the three roles, default privileges). One profile with **only** a student-scoped `mentor` persona; no tutor persona, no `class_tutors` row.

**Transcript, as the `authenticated` role with that profile's JWT claim:**

```
mentors_class  -> true
teaches_class  -> true
ASSIGNMENT INSERT AS MENTOR: SUCCEEDED (count=1)
RESOURCE INSERT AS MENTOR: SUCCEEDED
RESOURCE DELETE AS MENTOR: SUCCEEDED
```

The mechanism is one line at the end of `teaches_class()`:

```sql
  or mentors_class(p_class_id)
$$;
```

and four write policies keying off it:

```sql
assignments_insert      ... WITH CHECK (is_active_admin() OR teaches_class(class_id))
announcements_insert    ... WITH CHECK (is_active_admin() OR (class_id IS NOT NULL AND teaches_class(class_id)))
resources_insert        ... WITH CHECK (is_active_admin() OR teaches_class(class_id))
calendar_events_write   ... USING/WITH CHECK (is_active_admin() OR (class_id IS NOT NULL AND teaches_class(class_id)))
```

**Why this is worth restating even though their audit already has it.** Commit `4ab16dd` — the newest on the branch — adds a _narrow_ `manageAttendance` capability so mentors can edit attendance. That is the right shape of fix, and it establishes beyond argument that **mentor write authority is intended to be attendance-only**. The database currently grants nine tables more than that. Their re-audit puts it well: _"Writing the intent down without enforcing it is a worse position than not having written it down."_

**And this is why it survived three audits:** `tests/e2e/scoping.pw.ts:84` asserts _"a mentor CANNOT create an event for a mentee class (oversight is read-only)"_ — and it **passes**, because the API route refuses. The assertion is true of the application and false of the database. Every layer of testing the project has points at the app; the one harness that points at the database (`test-rls.sh`) has no mentor-write assertion.

**Recommendation** (matching theirs, with one addition):

1. Split `teaches_class()` into `teaches_class_read()` (keeps the `or mentors_class`) and `teaches_class_write()` (tutor-only). Point the write policies at the latter.
2. Add a narrow mentor clause to `attendance_write` and `class_sessions_write` only — exactly what `4ab16dd` declares.
3. **Add the RLS assertion that would have caught this**: as a student-scoped mentor, `insert into assignments(...)` must fail. Three lines in `test-rls.sh`. Without it, the same drift recurs.

---

## 4. R-01 — real, measurable, and less severe than rated

Their re-audit rates R-01 HIGH: the rebuild snapshot contains **zero** `REVOKE ... ON TABLE` while the chain contains six, and `operations.md` documents the snapshot as the provisioning/restore artefact. I verified the counts (snapshot 0, chain 6) and then measured the consequence.

**Experiment.** Two databases, both Supabase-faithful — default privileges granting `authenticated` table DML applied _before_ any objects exist, exactly as Supabase does. One provisioned from the migration chain, one from `supabase/rebuild/0000_full_rebuild.sql`.

| Table                                    | Chain-provisioned      | Snapshot-provisioned                   |
| ---------------------------------------- | ---------------------- | -------------------------------------- |
| `profiles`                               | DELETE, INSERT, SELECT | DELETE, INSERT, SELECT, **UPDATE**     |
| `submissions`                            | DELETE, SELECT         | DELETE, **INSERT**, SELECT, **UPDATE** |
| `audit_log`, `guardians`, `org_settings` | identical              | identical                              |

**So the grant boundary is genuinely lost.** `0033`/`0065` narrow `profiles` UPDATE to specific columns; `0067` revokes `submissions` INSERT to force writes through the deadline-enforcing RPC. A snapshot-provisioned database has neither.

**But I could not turn that into an escalation.** Both attacks were blocked — by the _second_ layer:

| Attack                                            | Chain DB                                                       | Snapshot DB                                         |
| ------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| Student sets own `profiles.role = 'admin'`        | `ERROR: permission denied for table profiles` (grant layer)    | `UPDATE 0` — **RLS blocked**; role unchanged        |
| Student inserts a submission past a hard deadline | `ERROR: permission denied for table submissions` (grant layer) | `ERROR: new row violates row-level security policy` |

The snapshot is a `pg_dump` of the end state, so it **retains every policy and trigger** — it loses only the GRANT/REVOKE epilogue.

**Assessment.** R-01 is a real defect and should be fixed: the snapshot's entire purpose is to reproduce the chain's end state, and it demonstrably does not. But on the evidence I gathered, it is a **reduction of defence-in-depth from two layers to one, not an open door** — I would rate it **MEDIUM**, not HIGH, and I would not hold the deployment for it provided you provision production from the chain (which `setup-guide.md` already instructs) rather than the snapshot.

I want to be explicit that this is a _downgrade of someone else's finding based on evidence they did not gather_, not a disagreement about the facts. Their reading of the snapshot was correct in every particular. Two caveats on my own result: I tested two paths, not all of them, and a future table whose RLS is weaker than its column grants would convert this into a live hole — which is the real argument for fixing it regardless.

**Recommendation:** generate the privilege epilogue into the snapshot and add a CI assertion that its `REVOKE ... ON TABLE` count matches the chain's. Until then, `operations.md` should say the snapshot is not a provisioning artefact.

---

## 5. R12 findings — status

### Closed

| R12 finding                                           | Status                                                                                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§2.1** Access matrix stale (sub-admin `/classroom`) | ✅ Matrix updated; the comment now documents the widened persona                                                                                                                                                      |
| **§2.2** Add-user journey spec stale                  | ✅ Fixed                                                                                                                                                                                                              |
| **§1** Rebuild snapshot stale                         | ✅ Current at `0076`                                                                                                                                                                                                  |
| **NEW-28** `.githooks/pre-push` mode `100644`         | ✅ **Now `100755`** — the guard finally works off Windows                                                                                                                                                             |
| **R10 §4.2** PII exposure surface                     | ✅ **Better than recommended.** `e3eec88` _removed_ `gender` and `address` and made `phone` optional — data minimisation rather than access control. `0073` adds a `consents` table. Privacy and terms pages shipped. |

### Still open

| Finding                                                             | Severity  | Note                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§4.1** Google OAuth consent screen publishing status undocumented | 🟠 High   | Unchanged, and **this is now the item most likely to break production**. If the OAuth client is in `Testing`, the refresh token expires after 7 days and every attachment upload and download fails at once — about a week after go-live. Nothing in `deployment.md §6`, `environment.md`, or `get-drive-refresh-token.mjs` mentions it. **Not verified** — I cannot see your Google Cloud console. |
| **§4.1b** `invalid_grant` discarded                                 | 🟡 Medium | `drive-storage-google.ts:35` still throws `Drive token exchange failed: ${res.status}` — a bare `400`. Google's body says `invalid_grant`, which is the whole diagnosis.                                                                                                                                                                                                                            |
| **§3.3** No queue-depth or failed-attachment alarm                  | 🟠 High   | Still absent from the keepalive cron. With the drain cron deliberately _not_ in `vercel.json` (R12 §3.2), this is the only thing that would tell you email has silently stopped.                                                                                                                                                                                                                    |
| **§4.3** New tables ship without RLS assertions                     | 🟡 Medium | **Third consecutive pass.** Harness still at 34 assertions. `guardians` (0076) and `consents` (0073) have **zero** — `grep` returns 0 for both. Their policies are correct on inspection (read-only self+admin, no write policy, service-role writes), but that is the harness's job, not a reviewer's.                                                                                             |
| **R10 §5.3** Unbounded analytics reads                              | 🟡 Medium | Unchanged                                                                                                                                                                                                                                                                                                                                                                                           |
| **R10 §9** `design_assets/` — 14 binaries, 19 MB                    | 🟢 Low    | Unchanged                                                                                                                                                                                                                                                                                                                                                                                           |
| **R11 §4.3** `EXTENSION_MIME` executable-type note                  | 🟢 Low    | Unchanged                                                                                                                                                                                                                                                                                                                                                                                           |
| **FIND-29** No dark mode                                            | 🟡 Medium | Fourteenth pass                                                                                                                                                                                                                                                                                                                                                                                     |

### Deployment gates — unchanged, still unverifiable

B2 (Supabase Pro + backups), B3 (custom SMTP → Resend), B4 (Vercel Pro), B5 (region `bom1`), B6 (preview/production separation), B7 (restore drill) remain **Not verified**. All are documented. Their re-audit's **B-02** adds a second unverified cluster — the Supabase dashboard auth controls (leaked-password protection, minimum length, brute-force, signup, OAuth allowlist, session expiry). Both clusters need someone to walk the dashboards and record what they find.

---

## 6. Database

**39 tables, chain `0001`–`0076`**, snapshot current, 34 RLS assertions passing.

New since R12: `guardians` (0076), `consents` (0073), plus assignment `ends_at` checks, legacy exam-event migration, and email-queue claim semantics. The re-audit's assessment of `0066`–`0070` as "model remediations" matches what I read — `0070` withholding `staff_note` from the `authenticated` SELECT list is the right shape, and fail-closed for future columns.

**Capacity is unchanged and remains comfortable.** The new tables are small: `guardians` is a handful of rows per student, `consents` one row per person per policy version. The R10 model still holds — **year-1 ≈ 145 MB against the 500 MB Free-tier limit**, with `audit_log` capped at 24 months. Database size is still not a reason to upgrade; **backups still are.**

One capacity note worth adding: the data-minimisation pass (`e3eec88`) _reduced_ stored PII. That is the rare change that improves capacity, compliance, and risk simultaneously.

---

## 7. Prioritised plan

### Before production

| #   | Action                                                                                                      | Finding | Effort |
| --- | ----------------------------------------------------------------------------------------------------------- | ------- | ------ |
| 1   | Fix `CookieNotice` with `useSyncExternalStore`; get lint green                                              | §2      | 20 min |
| 2   | **Split `teaches_class()` into read/write; repoint the write policies**                                     | §3      | 3 h    |
| 3   | **Add the RLS assertion that catches mentor writes**                                                        | §3      | 20 min |
| 4   | **Set the Google OAuth consent screen to `In production`**; re-capture the refresh token; document the step | §5      | 30 min |
| 5   | Surface `invalid_grant` in the Drive token-exchange error                                                   | §5      | 10 min |
| 6   | Queue-depth + failed-attachment alarm in the keepalive cron                                                 | §5      | 30 min |
| 7   | **Wire the drain + reconcile jobs** on the production project; verify one run of each                       | §5      | 30 min |
| 8   | RLS assertions for `guardians` and `consents`                                                               | §5      | 30 min |
| 9   | Generate the privilege epilogue into the snapshot + CI count assertion                                      | §4      | 2 h    |
| 10  | **Supabase Pro — backups + PITR**, then the restore drill                                                   | B2/B7   | 2 h    |
| 11  | **Auth email → custom SMTP (Resend)**; receive a real reset                                                 | B3      | 30 min |
| 12  | **Vercel Pro**; confirm region `bom1`                                                                       | B4/B5   | 30 min |
| 13  | Preview/production separation                                                                               | B6      | 2 h    |
| 14  | **Walk the Supabase auth dashboard** and record every setting                                               | B-02    | 30 min |
| 15  | Smoke-test a PDF render and a full Drive upload/download/delete on deployed infrastructure                  | —       | 1 h    |

Items 2–3 and 4 are the two I would not ship without. Everything else on this list is either an environment switch or a guard.

### Soon after

A-04 (re-auth on email/password change, session revocation), A-09, A-10, R-02 — all from their re-audit, all correctly prioritised there. Plus: derive the E2E access matrix from `PERSONA_CAPABILITIES`; bound the analytics reads; `git rm -r design_assets`; dark mode or drop the dark `themeColor`.

---

## 8. Scorecard

| Dimension            |   R12   |   R13   | Justification                                                                                                                                                                                                                                                                           |
| -------------------- | :-----: | :-----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture         |    9    |  **9**  | Twelve migrations and six features absorbed cleanly                                                                                                                                                                                                                                     |
| Security             |    9    |  **8**  | −1: A-07 is now _demonstrated_, and the codebase states an intent the database contradicts. Offset by data minimisation, consents, and a real security cadence                                                                                                                          |
| Maintainability      |    9    |  **9**  | Two independent security audits in five days, both acted on                                                                                                                                                                                                                             |
| Performance          |    9    |  **9**  | Bundle flat at 127.4 KB for seven passes                                                                                                                                                                                                                                                |
| Scalability          |    9    |  **9**  | Still no queue alarm                                                                                                                                                                                                                                                                    |
| Documentation        |   10    | **10**  | Privacy/terms shipped; audit trail is exemplary                                                                                                                                                                                                                                         |
| Testing              |    7    |  **9**  | +2: **69/69 E2E**, 1154 unit tests. −1: new tables still ship without RLS assertions, third pass running                                                                                                                                                                                |
| Developer Experience |    9    | **10**  | +1: pre-push hook finally executable; snapshot current; manifest guard holding                                                                                                                                                                                                          |
| User Experience      |    9    |  **9**  | Privacy/terms, guardians, multi-tutor all shipped                                                                                                                                                                                                                                       |
| Code Quality         |   10    |  **9**  | −1: lint red                                                                                                                                                                                                                                                                            |
| **Overall**          | **9.0** | **9.3** | Best-measured state of the project. The E2E suite is fully green for the first time, tests are up 21%, and PII was reduced rather than merely guarded. Held back by one lint error, one demonstrated privilege gap at the RLS boundary, and six deployment gates nobody has yet walked. |

---

## 9. What I got wrong, and one thing I changed my mind about

- **Two false alarms from chained execution** (§1.1) — a build ENOENT and a migration-chain failure, both artefacts of running gates back-to-back. Second consecutive pass with a self-inflicted scare; the mitigation is now written down.
- **I nearly overstated R-01.** My working hypothesis was that snapshot-provisioning would let a student self-escalate to admin. I ran it: the grant layer permitted the statement, and **RLS blocked it** (`UPDATE 0`). I had the mechanism right and the impact wrong, and I only found out because I executed it instead of reasoning about it. That is what moved my rating from HIGH to MEDIUM (§4).
- **I did not re-derive the security audit**, and I want to be clear that is a deliberate scope call rather than a gap. [The 2026-08-25 re-audit](./2026-08-25-security-reaudit.md) is more thorough on security than this document, it verified its own build claims by running them, and its fix order is right. My contribution is the two experiments in §3 and §4 and the deployment-readiness view.

---

_Revision 13 performed 2026-08-25 against `feature/cert-ed-academia-app` @ `4ab16dd` (chain head `0076`) with an in-flight working tree (§0), including a clean rebuild, the full Playwright suite, the RLS harness, a hand-walked migration chain, and five Supabase-faithful database experiments on real Postgres 18. All experiment databases were dropped; no application code was modified. Items that could not be verified from the repository — Supabase plan, region, backups, SMTP and auth dashboard settings; Vercel plan; the Google OAuth consent-screen publishing status; and whether the drain/reconcile jobs are scheduled — are labelled_ **Not verified** _in place._
