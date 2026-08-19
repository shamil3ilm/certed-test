# Cert-Ed Academia — Full Architecture & Codebase Audit

- **Date:** 2026-08-19 · **Revision 13** (living document; supersedes revisions 1–12. Filename reflects the first pass.)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `6adab47` · **working tree clean**
- **Method:** read-only static analysis + live execution of `build` (clean `.next`), `typecheck`, `test:coverage`, `lint`, `format:check`, `check:bundle`, `check-snapshot-freshness`, `playwright test`, `npm audit`, `scripts/test-rls.sh` against real Postgres 18, and a direct run of `.githooks/pre-commit`
- **Scope:** Phases 1–19 of the audit brief

---

## 0. Revision 13 — three gates red, and a guarded failure mode recurred anyway

Nineteen commits, a large feature window (subjects master, richer profiles, exam events,
session timings, assignment PDFs, org-settings screen) and four migrations.

Two of last pass's findings were fixed properly — including a **pre-commit hook** that
implements exactly the escalation recommended. But **three gates are red**, and the worst of
them is a repeat of a failure this project has already diagnosed, documented, and written a
checklist rule to prevent.

### Verification results

| Command                 | R10   | R11   | R12      | R13                                    |
| ----------------------- | ----- | ----- | -------- | -------------------------------------- |
| `npm run typecheck`     | ✅    | ✅    | ✅       | ✅                                     |
| `npm run lint`          | ✅    | ✅    | ✅       | ✅                                     |
| `npm run format:check`  | ✅    | ✅    | ❌ 10    | ✅ **clean**                           |
| `npm test`              | 875   | 876   | 924      | ✅ **953 passed (123 files)**          |
| `npm run test:coverage` | ✅    | ✅    | ✅       | ❌ **3 thresholds breached**           |
| `npm run build`         | ✅    | ✅    | ✅       | ✅ **0 warnings**                      |
| `npm run check:bundle`  | ✅    | ✅    | ✅       | ✅ **127.4 / 145 KB**                  |
| `npx playwright test`   | ❌ 1  | ❌ 1  | ✅ 65/65 | ❌ **49 failed · 1 flaky · 15 passed** |
| Snapshot freshness      | ✅    | ✅    | ❌       | ❌ **0060 vs 0064 (6th)**              |
| `scripts/test-rls.sh`   | ✅ 34 | ✅ 34 | ✅ 34    | ✅ **34 passed**                       |
| `npm audit --omit=dev`  | ✅    | ✅    | ✅       | ✅ **0**                               |

### Findings closed this pass

| ID                      | Finding                                                                    | Evidence                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NEW-26** 🟠           | Ten committed files unformatted                                            | ✅ `04bb6fd chore: format files left unformatted by the prior batch`. `format:check` clean.                                                                                                                                                                                                                                                       |
| **Mock-parity rule** 🟡 | No standing rule for new tables read on rendered pages — recommended in R9 | ✅ `docs/migration-checklist.md` item 4: _"Does mock mode need matching support?"_ **The rule exists. It was not followed — see NEW-29.**                                                                                                                                                                                                         |
| **Pre-commit guard**    | Formatting + snapshot enforced only at push/CI                             | ✅ `5908407 chore(hooks): pre-commit guard for formatting + snapshot freshness` — exactly the escalation recommended in R12, with the recurrence history cited in the comment: _"the two failures that keep reaching CI/push during large refactors."_ Verified: the logic is correct and would block a migration committed without its snapshot. |

### New findings

| ID         | Finding                                                                                                                                                                                                                                                                                                    | Severity    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **NEW-29** | **The mock harness has no `subjects` table** (migration `0064`). The portal layout throws, the login page's form is detached mid-render by the error boundary, and **49 of 65 E2E specs fail** (plus 1 flaky; only 15 pass) as a cascade. This is NEW-22 (the FX/`exchange_rates` gap) repeating verbatim. | 🔴 Critical |
| **NEW-30** | Coverage ratchet breached on three of four metrics — second occurrence                                                                                                                                                                                                                                     | 🟠 High     |
| **NEW-31** | Snapshot stale (`0060` vs chain `0064`) — **sixth occurrence**, the first with _both_ a pre-commit and a pre-push guard in place                                                                                                                                                                           | 🟠 High     |
| **NEW-32** | `0064` adds a `subjects` table with a `subjects_read` RLS policy; `scripts/test-rls.sh` contains **zero** references to `subjects`                                                                                                                                                                         | 🟢 Low      |

### Carried, unfixed

**NEW-28** — both `.githooks/pre-commit` and `.githooks/pre-push` are still committed as mode
`100644`. Git silently skips a non-executable hook on Unix. This is now the most probable
explanation for NEW-31, and it directly undermines the new pre-commit guard.

Also still open: restore drill not performed (FIND-35), no dark mode (FIND-29, **thirteenth
pass**), bundle ratchet 145 → 133 not taken (**eighth pass**).

---

## 1. Executive Summary

Cert-Ed Academia is a Next.js 16 App Router monolith serving two hosts from one codebase: a
public marketing site (`certedacademia.com`) and a private academy portal
(`app.certedacademia.com`), on Supabase (Auth + Postgres with RLS) and Vercel.

The application layer remains sound — 953 unit tests pass, the RLS harness is green, the build
is clean, there are no dependency vulnerabilities, and the first-load bundle has not moved
through another large feature window.

The problem this pass is not the code, it is that **the guardrails built over five revisions
did not fire**. A migration added a table the app reads; the mock harness was not updated;
every E2E spec that needs a login now fails. That exact failure was diagnosed in revision 9
(NEW-22, the FX table), and a migration-checklist rule was added in response — the rule now
exists and was not followed. Meanwhile a pre-commit hook was added specifically to stop
snapshot drift, and the snapshot drifted by four migrations in the same window.

The common thread is **NEW-28**: both hooks are committed non-executable, so git may be
skipping them silently.

| #   | Problem                                                                   | Severity    |
| --- | ------------------------------------------------------------------------- | ----------- |
| 1   | Mock harness missing `subjects` → login crashes → 49 of 65 E2E specs fail | 🔴 Critical |
| 2   | Coverage ratchet breached (2nd occurrence)                                | 🟠 High     |
| 3   | Snapshot stale (6th occurrence) despite two guards                        | 🟠 High     |
| 4   | Both git hooks committed non-executable                                   | 🟡 Medium   |
| 5   | Restore drill documented but never performed                              | 🟡 Medium   |

**Overall project health: 8.8 / 10** (…9.4 → 9.5 → 9.4 → 8.8). The steepest drop in the
series, and it is about process integrity rather than engineering quality.

---

## 2. Project Overview (Phase 1)

### 2.1 Stack

| Concern       | Technology                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 16.3, App Router, Turbopack build                                                                   |
| Language      | TypeScript 5, `strict: true`                                                                                |
| UI            | React 19.2, Tailwind CSS v4, design-system tokens                                                           |
| Edge          | `src/proxy.ts` — host split, session refresh, auth gate, per-request CSP nonce, cookie-preserving redirects |
| Database      | Supabase Postgres, RLS on every table, chain `0001`–`0064`, `pg_cron` retention + email drain               |
| Auth          | Supabase Auth (password + gated Google sign-in), allowlist-first                                            |
| File storage  | Custodial — academy-owned Google Drive ([ADR-0006](docs/adr/0006-custodial-attachment-storage.md))          |
| Validation    | Zod v4                                                                                                      |
| Email         | Resend, drained from a queue via `pg_cron` or Vercel Pro cron                                               |
| Observability | `logError` → stderr + Sentry, correlated by request id                                                      |
| Testing       | Vitest 4 (123 files, 953 tests) + coverage ratchet + Playwright (**failing**) + RLS harness (34 assertions) |
| CI            | `verify` + `e2e` + `rls` jobs; pre-commit and pre-push hooks                                                |
| Hosting       | Vercel, region `bom1`                                                                                       |

### 2.2 What shipped this window

Subjects master with subject-per-class and a user-detail hub; richer profile capture with
self-service completion; an `exam` calendar kind plus a dashboard exam widget; attendance
session timings with mentor join/leave; assignments carrying a custodial PDF; an org-settings
admin screen; and migrations `0061`–`0064` (exam kind, attachment assignment owner, dead-column
drops, subjects + profile details).

Also two correctness fixes worth noting: `99a8096`/`40242d8` render the root 404 dynamically so
its scripts receive the CSP nonce, and `0f458c7` renders mock PDFs with Playwright's Chromium
so PDF routes stop 502-ing in CI.

### 2.3 Bundle profile

```
First-load shared JS (gzipped): 127.4 KB across 4 chunks
Budget (firstLoadSharedKb):     145 KB · headroom 17.6 KB
```

Flat across seven passes, through two large feature windows. The ratchet suggestion has now
printed eight times.

### 2.4 Cron scheduling — a deliberate, well-documented constraint

`1094dbd` reverted `vercel.json` to keepalive-only. This is **not** an oversight:

> The 5-minute drain-emails schedule is sub-daily and, with reconcile-attachments, put three
> crons in vercel.json — which exceeds the Vercel Hobby limit… Commit only the daily keepalive
> so the repo deploys on any plan; the drain + reconcile jobs are wired on the production (Pro)
> project or via pg_cron (0058) at deploy time, per deployment.md.

[docs/deployment.md](docs/deployment.md) §5 carries a table naming each job, its cadence, **and
the consequence of not wiring it** (_"Queued `pending_emails` are never sent"_, _"Orphaned
uploads / pending rows accumulate"_), plus two wiring options. That is the right way to handle
a platform constraint — the risk is documented rather than hidden. It remains a manual
deploy-time step, so it belongs on the production checklist.

---

## 3. Open Findings

---

### NEW-29 · The mock harness has no `subjects` table — 49 of 65 E2E specs fail — 🔴 CRITICAL

```
$ grep -c 'subjects' src/lib/mock/seed.ts src/lib/mock/store.ts
src/lib/mock/seed.ts:0
src/lib/mock/store.ts:0
```

Migration `0064_subjects_and_profile_details.sql` creates `subjects`, gives it an RLS policy,
and adds `classes.subject_id`. The app reads it. **The mock harness has no such table.**

**The blast radius is most of the suite.** The completed run reports **49 failed, 1 flaky,
15 passed (22.0m)**. Failures span `admin-permissions`, `attachments`, `dashboard-cards` (all
six personas), `negative-access`, `responsive` and more. The 15 survivors are the specs that
never sign in — the marketing pair and similar — which is itself the clearest confirmation
that the failure is a login cascade rather than 49 independent defects.

**The mechanism, from the artifacts:**

```
TimeoutError: page.fill: Timeout 15000ms exceeded.
  - locator resolved to <input … id="dev-email" …/>
  - attempting fill action
  - element was detached from the DOM, retrying
```

and in the same snapshot:

```
- heading "Something went wrong" [level=1]
```

The login form **renders, then is torn out** as the error boundary replaces it — the signature
of a streamed server segment throwing after the shell has flushed. `/login` lives inside the
`(prt)` route group, so it renders the portal layout; a layout-level read of `subjects` throws,
the boundary swaps in, and `loginAs` cannot fill a detached input. **Every spec that logs in
fails as a cascade from one missing fixture.**

**Not verified:** the exact read that throws. The evidence chain (missing table → error
boundary on a portal-group page → login unusable → suite-wide failure) is strong, but I have
not traced the specific query.

**Why this one matters more than its severity alone:**

This is **NEW-22 repeating verbatim.** In revision 9, migration `0056` added `exchange_rates`,
the mock harness lacked it, the admin dashboard threw into its error boundary, and it was
mis-diagnosed as a stale test selector for a full pass. The recommendation then was a standing
rule. That rule now exists — `docs/migration-checklist.md` item 4, _"Does mock mode need
matching support?"_ — and `0064` shipped without it.

A checklist item that is not enforced is a note, not a control. The project has already
learned this lesson once, about snapshot drift, and responded correctly by making it
mechanical (a hook). The same escalation is now due here.

**Recommendation:**

1. Add `subjects` to `src/lib/mock/seed.ts` and `store.ts`, seed two or three rows, and set `classes.subject_id` on the seeded classes. Re-run the suite.
2. **Make the rule mechanical.** A test that asserts every table in the migration chain has a mock counterpart is a ~20-line unit test — it runs in the existing `verify` job and cannot be forgotten:
   ```
   for each `create table X` in supabase/migrations/*.sql
     expect(mockStoreTables).toContain(X)
   ```
   That converts item 4 from a habit into a gate, exactly as the pre-commit hook did for snapshot drift.
3. Consider whether a portal-layout read should be resilient: a missing reference table taking down the _login page_ is a wide failure mode for a narrow cause.

---

### NEW-30 · Coverage ratchet breached — second occurrence — 🟠 High

```
ERROR: Coverage for lines (70.75%) does not meet global threshold (72%)
ERROR: Coverage for statements (66.16%) does not meet global threshold (67%)
ERROR: Coverage for branches (56.85%) does not meet global threshold (57%)
```

953 tests pass — 29 more than last pass — but the feature window added materially more
untested code. Lines fell **73.14 → 70.75**, undoing the margin deliberately widened in
revision 12 (`70a438e test(unit): widen the branch-coverage margin`).

The pattern is now visible across the series: coverage is restored when it breaks (R9, R12)
and erodes during every large feature window (R8, R13). The ratchet is catching real drift —
but it is being treated as something to repair afterwards rather than to hold during.

**Recommendation:** add tests for this window's largest uncovered additions — the subjects
service, profile-completion, exam-event handling and org-settings are the candidates
(`npx vitest run --coverage` prints per-file numbers). **Do not lower the thresholds.** If the
team wants headroom that survives a feature window, raise coverage toward ~78% once rather
than repairing a 1-point margin every other pass.

---

### NEW-31 · Snapshot stale — sixth occurrence, with two guards in place — 🟠 High

```
::error::rebuild snapshot is stale (snapshot=0060, migrations head=0064)
```

Four migrations landed without a regenerated snapshot, in `6adab47 feat(db): migrations
0061-0064`.

**What makes this occurrence significant:** the pre-commit hook added in this same window
(`5908407`, which precedes `6adab47` in history) is designed to block exactly this. I ran its
logic directly and confirmed it is correct — it checks freshness whenever a migration is
staged, and `scripts/check-snapshot-freshness.sh` currently exits 1. The guard would have
caught it.

So either `--no-verify` was used, or **the hook did not run** — see NEW-28.

CI is the backstop and is red, so this cannot reach `main`.

**Recommendation:** regenerate (`supabase db reset && npm run db:rebuild-snapshot`), and fix
NEW-28 in the same change. Fixing only the snapshot makes the sixth occurrence a seventh.

---

### NEW-28 · Both hooks are committed non-executable — 🟡 Medium _(carried, now consequential)_

```
$ git ls-files -s .githooks/
100644 49f6196… 0   .githooks/pre-commit
100644 9069edc… 0   .githooks/pre-push
$ git config core.fileMode
false
```

Raised in revision 12 and unfixed. On Windows, `core.fileMode=false` means git ignores the
mode and hooks still run — which is why this is invisible locally. **On Linux and macOS git
silently skips a hook that is not executable**: no error, no warning, no output.

Revision 12 noted that commit `adb1350 chore: mark the pre-push hook and freshness script
executable` had fixed this once, and that the revision-10 squash dropped it. The new
pre-commit hook has now inherited the same defect from birth.

This is the most probable explanation for NEW-31, and it means the escalation the team
correctly identified — moving from a documented rule to a mechanical guard — may not have
taken effect at all.

**Recommendation:**

```bash
git update-index --chmod=+x .githooks/pre-commit .githooks/pre-push scripts/*.sh
```

and add a CI assertion so a future squash cannot drop it silently:

```yaml
- name: Hooks must be executable
  run: |
    for h in .githooks/pre-commit .githooks/pre-push; do
      mode=$(git ls-files -s "$h" | cut -d' ' -f1)
      [ "$mode" = "100755" ] || { echo "::error::$h is $mode, not executable — git will skip it on Unix"; exit 1; }
    done
```

---

### NEW-32 · The new `subjects` RLS policy has no harness assertion — 🟢 Low

`0064` adds `create policy subjects_read on subjects for select using (current_status() =
'active')`. `grep -ci 'subjects' scripts/test-rls.sh` → **0**.

The harness covers `attachments` well (13 references) and its assertion count has held at 34
across four migrations. `0062` also rewrote the `attachments_read` policy, so an existing
assertion may or may not still exercise the changed branch.

**Recommendation:** add two assertions for `subjects` (an active user sees rows; a disabled
user sees none) and confirm the `attachments_read` rewrite is still covered. The harness is in
CI and green — extending it is cheap and keeps its 34-assertion figure meaningful.

---

### Remaining carried findings

| ID                   | Finding                                                                                                        | Severity  | Note                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| **FIND-35**          | Restore drill still not performed.                                                                             | 🟡 Medium | [docs/operations.md](docs/operations.md) scripts it and says what to record.                  |
| **FIND-29**          | No dark mode — `grep "dark:"` → **0** across thirteen passes, while `layout.tsx` declares a dark `themeColor`. | 🟡 Medium | The token layer from R12 is the foundation; or delete the dark `themeColor` in one line.      |
| **Cron wiring**      | Email drain and attachment reconcile are manual deploy-time steps.                                             | 🟡 Medium | Well documented in `deployment.md` §5 with consequences; belongs on the production checklist. |
| **M5**               | Ratchet `firstLoadSharedKb` 145 → 133.                                                                         | 🟢 Low    | Eight passes.                                                                                 |
| **FIND-09/10**       | `src/features` never built; mock harness in the production module graph.                                       | 🟢 Low    |                                                                                               |
| **NEW-06**           | Matrix-persona reads sequential (bounded at 5).                                                                | 🟢 Low    |                                                                                               |
| **FIND-32**          | No automated a11y check.                                                                                       | 🟢 Low    |                                                                                               |
| **FIND-31/44/45/46** | Blog JSX; no global search; footer mojibake; no in-app help.                                                   | 🟢 Low    |                                                                                               |

---

## 4. Security Audit (Phase 3)

| Control                          | State                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dependency vulnerabilities**   | ✅ **0**.                                                                                                                                                                                                                                                                |
| **CSP**                          | ✅ Nonce-based; `99a8096` fixed the root 404 to render dynamically so its scripts receive the nonce.                                                                                                                                                                     |
| **Database-layer authorization** | ✅ 34 assertions passing with `0064` applied — but see NEW-32.                                                                                                                                                                                                           |
| **App-layer authorization**      | ⚠️ **Cannot be verified this pass.** The E2E suite — which carries the negative sweeps, positive controls and API scoping — is failing on a fixture gap, so the access-control assertions did not execute. No evidence of a defect; equally, no evidence of correctness. |
| **Secrets**                      | None in git; inventory, rotation and environment reference documented.                                                                                                                                                                                                   |
| **Guard integrity**              | ⚠️ **NEW-28** — both hooks may be inert on Unix.                                                                                                                                                                                                                         |

**On A01 (Broken Access Control):** the RLS half is verified; the app half is currently
unverified because the harness that checks it cannot boot. That is the practical cost of
NEW-29 beyond the red gate — an entire class of security assertion is silently not running.

---

## 5. Performance Audit (Phase 4)

Unchanged and strong. First-load flat at 127.4 KB through another large feature window. Email
still queued off the request path, org settings cached, dashboards batched, 304 on unchanged
finance PDFs.

---

## 6. Maintainability (Phase 5)

| Principle                     | Assessment                                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP / OCP / DRY / KISS**    | **Strong**, unchanged.                                                                                                                                                                                                 |
| **Escalation instinct**       | **Correct.** The pre-commit hook is exactly the right response to a recurring failure, and its comment cites the specific recurrences. The instinct to convert habits into gates is one of this project's best traits. |
| **Escalation follow-through** | ⚠️ **The gap.** The hook was added but not made executable; the mock-parity rule was written but not enforced. Both are one small step short of working.                                                               |
| **Migration hygiene**         | `0063_drop_dead_columns.sql` drops columns — a destructive migration, appropriately scoped to _"confirmed-dead"_ columns and paired with the code change that stopped reading them.                                    |

### Module scorecard

| Module                                                                  | R11 | R12 |  R13   | Note                                                           |
| ----------------------------------------------------------------------- | :-: | :-: | :----: | -------------------------------------------------------------- |
| `src/lib/capabilities` / `permission`                                   | 10  | 10  | **10** |                                                                |
| `src/lib/observability` / `security`                                    | 10  | 10  | **10** |                                                                |
| `src/proxy.ts`                                                          | 10  | 10  | **10** |                                                                |
| `src/lib/attachments`                                                   |  9  | 10  | **10** |                                                                |
| `src/lib/ui`                                                            |  9  |  9  | **9**  |                                                                |
| `src/app/(prt)`                                                         |  9  |  8  | **9**  | +1: formatting restored                                        |
| `src/lib/data` / `services` / `api` / `auth` / `session` / `validation` |  9  |  9  | **9**  |                                                                |
| `supabase/migrations`                                                   | 10  | 10  | **9**  | −1: `subjects` shipped without mock parity or an RLS assertion |
| `supabase/rebuild`                                                      | 10  |  7  | **6**  | −1: sixth staleness, now four migrations behind                |
| `scripts/` + `.githooks/`                                               | 10  |  7  | **7**  | Pre-commit hook is well designed; still non-executable         |
| `src/lib/mock`                                                          |  8  |  8  | **4**  | −4: a missing table takes down the entire E2E suite            |
| `tests/unit`                                                            |  9  | 10  | **8**  | 953 tests; −2 for the breached ratchet                         |
| `tests/e2e`                                                             |  9  | 10  | **6**  | Suite cannot run; the specs themselves are not at fault        |
| `.github/`                                                              | 10  | 10  | **10** | Three jobs; correctly red                                      |
| `docs/`                                                                 | 10  | 10  | **10** | Checklist rule added; deployment cron table is exemplary       |

---

## 7. Documentation (Phase 6)

Strong and improving. This window added a production-readiness audit and a handover pass
(`8c2343d docs: production-ready handover pass — accuracy, structure, standardization`), and
`deployment.md` §5's cron table — job, cadence, consequence-if-missing, two wiring options — is
the clearest operational writing in the repository.

The migration checklist gained the mock-parity item recommended in revision 9. **The
documentation is not the problem this pass; the enforcement is.**

---

## 8. Debugging Experience (Phase 7)

The observability chain is complete and was used again: the E2E artifacts alone were enough to
identify NEW-29's mechanism (form detached from the DOM + error-boundary heading) without
touching the application.

---

## 9. Database Review (Phase 8)

**Schema:** 36+ tables, RLS on all, chain `0001`–`0064`, `pg_cron` retention and email drain, 34
RLS assertions passing.

Four new migrations, all with intent-stating headers. `0062` tightens the attachment
one-owner constraint and rewrites `attachments_read` to cover the assignment owner; `0063`
drops confirmed-dead columns; `0064` introduces the subjects master.

| ID         | Finding                                   | Severity | Status |
| ---------- | ----------------------------------------- | -------- | ------ |
| **NEW-31** | Snapshot `0060` vs chain `0064`           | 🟠 High  | New    |
| **NEW-32** | `subjects_read` unasserted in the harness | 🟢 Low   | New    |

---

## 10. Frontend Review (Phase 9)

A substantial window: subject-per-class and a user-detail hub, richer profile capture with
self-service completion, an exam calendar kind with a dashboard widget, attendance session
timings, assignment PDFs, and an org-settings admin screen.

None of it could be exercised end to end this pass (NEW-29).

| ID          | Finding                                             | Severity    |
| ----------- | --------------------------------------------------- | ----------- |
| **NEW-29**  | Mock fixture gap takes down login and the E2E suite | 🔴 Critical |
| **FIND-29** | No dark mode (thirteenth pass)                      | 🟡 Medium   |

---

## 11. Backend Review (Phase 10)

Unchanged in shape and healthy: thin factory-driven route handlers, domain-split services, one
module per table group, Zod at every boundary, capability + persona + per-resource checks,
queued email, access-checked custodial attachments, `pg_cron` retention, request-id-correlated
observability.

---

## 12. DevOps Review (Phase 11)

Three CI jobs with report artifacts, plus pre-commit and pre-push hooks. CI is correctly red on
three gates.

**The theme is guards that exist but may not execute.** Two of the three red gates
(NEW-30 coverage aside) are things a hook was built to prevent. Fixing the mode bit and adding
the CI assertion in NEW-28 is a ten-minute change that restores the intended behaviour of work
already done.

---

## 13. Testing Review (Phase 12)

| Type               | R11      | R12      | R13                                    |
| ------------------ | -------- | -------- | -------------------------------------- |
| Unit / integration | 114, 876 | 119, 924 | ✅ **123 files, 953 — passing**        |
| Coverage           | 72.32%   | 73.14%   | ❌ **70.75% — 3 breached**             |
| E2E                | ❌ 1     | ✅ 65/65 | ❌ **49 failed · 1 flaky · 15 passed** |
| RLS                | ✅ 34    | ✅ 34    | ✅ **34**                              |

The unit suite continues to grow with features (29 new tests). The E2E collapse is a fixture
problem, not a spec problem — the specs are fine and will pass once `subjects` exists in the
mock store.

**The structural lesson:** the E2E suite has a single point of failure at login. One missing
reference table in the mock harness silently converts a 65-spec safety net into zero coverage.
A mock-parity assertion in the unit suite (NEW-29 recommendation 2) would catch that in
seconds rather than after a full Playwright run.

---

## 14. UX Review (Phase 13)

Subjects, richer profiles with self-service completion, exam events, attendance timings,
assignment PDFs and an org-settings screen are all real capability additions.

| ID                | Finding                                           | Severity  |
| ----------------- | ------------------------------------------------- | --------- |
| **FIND-29**       | No dark mode (thirteenth pass)                    | 🟡 Medium |
| **FIND-44/45/46** | No global search; footer mojibake; no in-app help | 🟢 Low    |

---

## 15. Scalability Review (Phase 14)

| Dimension                            | Assessment                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Concurrency / horizontal scaling** | **Good.**                                                                                                         |
| **Request path**                     | **Good** — email queued, settings cached, dashboards batched.                                                     |
| **Large database**                   | Growth tables bounded by retention; `attachments`, `entity_tags` and now `subjects` index inventories unexamined. |
| **Client payload**                   | ✅ Flat at 127.4 KB.                                                                                              |
| **Scheduled work**                   | ⚠️ Drain and reconcile are manual deploy-time wiring (documented).                                                |

---

## 16. Complexity Analysis (Phase 15)

**Over-engineering:** none.

**Under-engineering — the recurring theme:**

| Control            | State                                                      |
| ------------------ | ---------------------------------------------------------- |
| Snapshot freshness | Guard exists (×2) — ❌ may not execute (NEW-28)            |
| Formatting         | Guard exists — ✅ working                                  |
| Mock parity        | **Rule exists, no guard** — ❌ failed immediately (NEW-29) |
| Coverage           | Guard exists — ✅ working, correctly red                   |
| Restore drill      | Documented, never executed                                 |

Three of five are one small step from working. That is a better position than it looks — but
the step has to be taken.

---

## 17. Prioritised Action Plan (Phase 18)

### 🔴 Critical

**C1 · Add `subjects` to the mock harness** — NEW-29 · ~1 h · seed the table and
`classes.subject_id`, re-run Playwright. Then **add a mock-parity unit test** that asserts every
`create table` in the migration chain has a mock counterpart — that converts checklist item 4
into a gate and prevents the third occurrence.

### 🟠 High

**H1 · Make the hooks executable and assert it in CI** — NEW-28 · ~10 min ·
`git update-index --chmod=+x .githooks/* scripts/*.sh` plus the mode assertion. **Do this
first** — it is what makes H2 stick.

**H2 · Regenerate the snapshot** — NEW-31 · ~20 min.

**H3 · Restore coverage above the ratchet** — NEW-30 · ~3–4 h · add tests for subjects,
profile completion, exam events and org settings. Consider a one-time push to ~78% so the
margin survives a feature window.

### 🟡 Medium

| ID  | Action                                                                                          | Finding |
| --- | ----------------------------------------------------------------------------------------------- | ------- |
| M1  | Add `subjects` assertions to the RLS harness; confirm the `attachments_read` rewrite is covered | NEW-32  |
| M2  | Perform the restore drill and record the RTO                                                    | FIND-35 |
| M3  | Put drain/reconcile cron wiring on the production checklist                                     | §2.4    |
| M4  | Dark mode on the token layer — or delete the dark `themeColor`                                  | FIND-29 |
| M5  | Index review for `subjects`, `attachments`, `entity_tags`                                       | §15     |

### 🟢 Low

| ID  | Action                                                          | Finding          |
| --- | --------------------------------------------------------------- | ---------------- |
| L1  | Ratchet `firstLoadSharedKb` 145 → 133                           | M5 (8 passes)    |
| L2  | `@axe-core/playwright` assertions                               | FIND-32          |
| L3  | Batch the matrix-persona reads                                  | NEW-06           |
| L4  | Mark `src/features` PLANNED or remove it                        | FIND-09          |
| L5  | Blog content → MDX; footer mojibake; global search; in-app help | FIND-31/45/44/46 |

---

## 18. Quick Wins

1. **`git update-index --chmod=+x .githooks/* scripts/*.sh`** — 1 min; makes two existing guards real. _(H1)_
2. **Add the hook-mode assertion to CI** — 5 min; stops a future squash dropping it a third time. _(H1)_
3. **Seed `subjects` in the mock store** — ~30 min; turns 49 failing E2E specs back to green. _(C1)_
4. **Regenerate the snapshot** — 20 min. _(H2)_
5. **Mock-parity unit test** — ~30 min; the highest-leverage item here, because it prevents the recurrence rather than the instance. _(C1)_
6. **Ratchet `firstLoadSharedKb` to 133** — 1 min; eight passes. _(L1)_

Items 1–4 take CI from three red gates to one in about an hour.

---

## 19. Long-Term Improvements

1. **Enforce parity, don't document it.** Every rule this project has made mechanical has held; every rule left as a checklist item has been skipped. Mock parity is the current example; hook-mode assertion is the next.
2. **Coverage headroom that survives a window.** Repairing a 1-point margin every other pass is more expensive than one push to ~78%.
3. **Restore drill.** Still the one control whose failure mode is total.
4. **Multi-tenancy readiness.** Subjects, multi-currency, custodial storage and per-slot timezones all point at a product that will need tenant scoping.

---

## 20. Overall Scorecard (Phase 16)

| Dimension                  |   R10   |   R11   |   R12   |   R13   | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | :-----: | :-----: | :-----: | :-----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**           |    9    |    9    |    9    |  **9**  | Subjects master and profile enrichment fit the existing layering cleanly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Security**               |   10    |   10    |   10    |  **8**  | −2: no defect found, but the E2E suite carrying the access-control assertions could not run, so the app half of authorization is unverified this pass.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Maintainability**        |   10    |   10    |    9    |  **9**  | The escalation instinct is right; the follow-through fell one step short twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Performance**            |   10    |   10    |   10    | **10**  | Bundle flat through another large window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Scalability**            |    9    |    9    |    9    |  **9**  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Documentation**          |    9    |   10    |   10    | **10**  | The deployment cron table is the best operational writing in the repo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Testing**                |    9    |    9    |   10    |  **6**  | −4: the E2E suite is down entirely and the coverage ratchet is breached. The specs are not at fault, but the safety net is not there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Developer Experience**   |   10    |   10    |    8    |  **7**  | −1 more: three red gates, and two guards that may not be executing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **User Experience**        |    9    |    9    |   10    |  **9**  | Real capability added; −1 for no dark mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Code Quality**           |    9    |    9    |    9    |  **9**  | Eight of eleven gates green, 0 warnings, 0 vulnerabilities.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
|                            |         |         |         |         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Overall Project Health** | **9.4** | **9.5** | **9.4** | **8.8** | The application is in good shape; the guardrails are not. A missing mock fixture took the entire E2E suite down — the same failure diagnosed in revision 9, for which a checklist rule was written and then not followed. A pre-commit hook was added to stop snapshot drift and the snapshot drifted four migrations in the same window, most likely because the hook is committed non-executable. Every one of these is a small fix, and the project's own history shows the pattern that works: make it mechanical. About an hour of work clears three red gates and closes two recurrence paths. |

---

## 21. Strengths

1. **The pre-commit hook is the right instinct, well executed** — it cites the specific recurrences it exists to prevent, reuses the exact scripts CI runs _"so local and CI verdicts can't diverge"_, and checks snapshot freshness only when a migration is staged. I verified the logic; it would catch NEW-31.
2. **`deployment.md` §5 on cron wiring** — job, cadence, consequence-if-missing, two options, and an explicit note on why the repo's `vercel.json` is deliberately minimal. Exemplary operational writing.
3. **A platform constraint handled honestly** — the Hobby cron limit is documented with its workaround rather than silently accepted or silently broken.
4. **Destructive migrations done carefully** — `0063` drops only _"confirmed-dead"_ columns, paired with the code change that stopped reading them.
5. **CSP correctness maintained under change** — the root 404 was made dynamic so its scripts receive the nonce.
6. **Unit tests keep pace with features** — 29 new tests alongside six feature areas.
7. **34 RLS assertions still green** with four new migrations applied.
8. **The capability model** — hard capabilities, reason-required overrides, documented precedence, ADRs.
9. **Bundle discipline** — 127.4 KB unchanged across seven passes and multiple large windows.
10. **Documentation that keeps improving** — a production-readiness audit and a handover pass landed in the same window as the features.

---

_Revision 13 performed 2026-08-19 against `feature/cert-ed-academia-app` @ `6adab47` with a
clean working tree, a clean `rm -rf .next` rebuild, and `scripts/test-rls.sh` against real
Postgres 18, and a completed Playwright run (**49 failed, 1 flaky, 15 passed, 22.0m**)._
_Not verified: the exact read that throws on the missing `subjects` table, whether the hooks
are skipped on a Unix clone, and whether Sentry DSNs are configured in Vercel._
