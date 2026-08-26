# Cert-Ed Academia — Full Architecture & Codebase Audit

- **Date:** 2026-08-25 · **Revision 15** (living document; supersedes revisions 1–14. Filename reflects the first pass.)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `5e23697` · **working tree clean**
- **Method:** read-only static analysis + **serial** execution of `typecheck`, `format:check`, `lint`, `npm audit`, `test:coverage`, `test-rls.sh` (real Postgres 18), `build` (clean `.next`), `check:bundle`, `check-snapshot-freshness`, `playwright test`
- **Scope:** Phases 1–19 of the audit brief

---

## 0. Revision 15 — every gate green, for the first time in fifteen passes

Ten commits. **All eleven checks pass**, including two that have never been green together
before, and the longest-carried operational finding in the series is now scripted.

### Verification results

| Command                 | R12      | R13          | R14        | R15                                   |
| ----------------------- | -------- | ------------ | ---------- | ------------------------------------- |
| `npm run typecheck`     | ✅       | ✅           | ✅         | ✅                                    |
| `npm run lint`          | ✅       | ✅           | ❌ 1 error | ✅                                    |
| `npm run format:check`  | ❌ 10    | ✅           | ✅         | ✅                                    |
| `npm test`              | 924      | 953          | 1,154      | ✅ **1,161 (153 files)**              |
| `npm run test:coverage` | ✅       | ❌           | ✅         | ✅ **76.96% lines · 64.04% branches** |
| `npm run build`         | ✅       | ✅           | ✅         | ✅ **0 warnings**                     |
| `npm run check:bundle`  | ✅       | ✅           | ✅         | ✅ **127.4 / 133 KB — ratchet taken** |
| `npx playwright test`   | ✅ 65/65 | ❌ 49 failed | ✅ 69/69   | ✅ **69 / 69**                        |
| Snapshot freshness      | ❌       | ❌ 6th       | ✅         | ✅ **0079 current**                   |
| `scripts/test-rls.sh`   | ✅ 34    | ✅ 34        | ✅ 34      | ✅ **64 passed**                      |
| `npm audit --omit=dev`  | ✅       | ✅           | ✅         | ✅ **0**                              |

### Findings closed this pass

| ID             | Finding                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NEW-33** 🟠  | `CookieNotice` lint error blocking CI                   | ✅ `dcb09ac` — fixed with **`useSyncExternalStore`**, the recommended option, rather than suppressing the rule.                                                                                                                                                                                                                                                                           |
| **NEW-32** 🟡  | RLS assertions (34) not keeping pace with policies (76) | ✅ **Closed, and made mechanical.** `c8e1bea` adds assertions for **guardians (PII), subjects, the financial system-of-record** (receipts/payslips/lines + org_settings) and **mentee_notes** — **34 → 64 passing**. Plus `tests/unit/rls-coverage-parity.test.ts`: every RLS-enabled table must be named in the harness or explicitly exempted, **and the exempt list may only shrink**. |
| **M5** 🟢      | Bundle ratchet 145 → 133 — open **nine passes**         | ✅ `firstLoadSharedKb: 133`, measured 127.4 KB. The win is locked in.                                                                                                                                                                                                                                                                                                                     |
| **FIND-35** 🟡 | Restore drill — open since **revision 4**               | ✅ **Scripted.** `scripts/restore-drill.sh` verifies a restored DB is at head and its receipts reconcile, with a `--rehearse` mode proving the build→dump→restore→verify cycle locally. **Partially closed** — see below.                                                                                                                                                                 |

#### The exempt-list ratchet is the detail worth noting

`rls-coverage-parity.test.ts` could have been a checkbox that any new table escapes by being
added to an ignore list. Instead the list **may only shrink**, and the comment says why: _"a new
RLS-enabled table should be asserted, not exempted."_ That closes the usual escape hatch, and
it is the same instinct that made the coverage and bundle budgets work — a ratchet, not a
threshold.

#### FIND-35 — scripted, not yet performed

The script is a real step forward and it anticipates the gap I raised in revision 10:

> The real drill: restore the latest Supabase backup into a scratch project, run this to
> confirm the schema is at head and receipts reconcile, and **SEPARATELY confirm the custodial
> attachments come back from Google Drive (they live outside the DB backup).**

But `docs/operations.md` still reads _"do it once, then annually"_, and there is no recorded
RTO. **The drill is now one command instead of a procedure — it has still not been run against
a real backup.** Severity drops from Medium to Low; it does not disappear, because the whole
point of the finding is that an untested backup is a hypothesis.

### New observation

| ID         | Observation                                                                                                                                                                                   | Severity |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **NEW-34** | `mentee_notes` (`0078`) holds pastoral notes about a student that the student can never read. Sound as an application rule; it needs a documented position on data-subject access under DPDP. | 🟢 Low   |

### Still open

| ID                                                                     | Finding                                                                                                                              | Severity  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| **FIND-29**                                                            | No dark mode — `grep "dark:"` → **0**, **fifteenth pass**, while `layout.tsx` declares a dark `themeColor`                           | 🟡 Medium |
| **FIND-35**                                                            | Restore drill scripted but never executed against a real backup                                                                      | 🟢 Low    |
| **FIND-32**                                                            | No automated a11y check                                                                                                              | 🟢 Low    |
| **NEW-06 / FIND-09 / FIND-10 / FIND-31 / FIND-44 / FIND-45 / FIND-46** | Matrix-persona batching; `src/features`; mock harness in the production graph; blog JSX; global search; footer mojibake; in-app help | 🟢 Low    |

---

## 1. Executive Summary

Cert-Ed Academia is a Next.js 16 App Router monolith serving two hosts from one codebase: a
public marketing site (`certedacademia.com`) and a private academy portal
(`app.certedacademia.com`), on Supabase (Auth + Postgres with RLS) and Vercel.

**Every gate is green.** That has not happened before in fifteen passes — the closest was
revision 7 (ten of eleven, with the RLS harness dead) and revision 11 (ten of eleven, with one
E2E failure). Today: 1,161 unit tests, 64 RLS assertions against real Postgres, 69 E2E specs,
a clean build, a ratcheted bundle budget, a current schema snapshot, and no dependency
vulnerabilities.

More importantly, the two findings closed this pass were closed **mechanically**: the RLS
coverage gap became a parity test with a shrink-only exemption list, and the restore drill
became a script. That is the pattern this audit has been pushing since revision 9, and it is
now the project's default response rather than something it has to be reminded of.

What remains is a short tail. The only Medium is dark mode — carried fifteen passes, and at
this point the honest choice is to build it on the existing token layer or delete the dark
`themeColor` that advertises it.

**Overall project health: 9.7 / 10** (…8.8 → 9.5 → 9.7). The highest in the series.

---

## 2. Project Overview (Phase 1)

### 2.1 Stack

| Concern       | Technology                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 16.3, App Router, Turbopack build                                                                                                                     |
| Language      | TypeScript 5, `strict: true`                                                                                                                                  |
| UI            | React 19.2, Tailwind CSS v4, design-system tokens                                                                                                             |
| Edge          | `src/proxy.ts` — host split, session refresh, auth gate, per-request CSP nonce, cookie-preserving redirects                                                   |
| Database      | Supabase Postgres, RLS on every table, chain `0001`–`0079`, `pg_cron` retention + email drain                                                                 |
| Auth          | Supabase Auth, allowlist-first, hardened cookies, mock-auth fails closed off Vercel                                                                           |
| File storage  | Custodial — academy-owned Google Drive (ADR-0006)                                                                                                             |
| Privacy       | Privacy/terms pages, cookie + contact notices, DPDP minimisation, **consent records**                                                                         |
| Email         | Resend, drained from a queue with atomic row claiming                                                                                                         |
| Observability | `logError` → stderr + Sentry, request-id correlated, PII stripped; queue-health monitoring                                                                    |
| Testing       | Vitest (153 files, 1,161 tests) + coverage ratchet + **RLS parity test** + Playwright (69 specs) + RLS harness (**64 assertions**) + **restore drill script** |
| CI            | `verify` + `e2e` + `rls` jobs; executable pre-commit and pre-push hooks                                                                                       |
| Hosting       | Vercel, region `bom1`                                                                                                                                         |

### 2.2 What shipped this window

**Pastoral and safeguarding data**: `mentee_notes` (`0078`) — a mentor's private notes about a
mentee, readable by that student's mentors and admins only; guardian-contacts service wired
into the admin user detail; attendance session times with staff session notes.

**Privacy**: consent-record data and service layer (`c3bd741`), privacy/terms/register copy,
further auth-cookie hardening.

**Security**: `7953067 fix(security): re-audit RLS/policy hardening (R-04, R-12, A-07)` — the
team's own re-audit findings, fixed and referenced by ID.

**Quality**: the CookieNotice fix, the bundle ratchet, the RLS assertion expansion, the RLS
parity test, and the restore-drill script.

### 2.3 Bundle profile

```
First-load shared JS (gzipped): 127.4 KB across 4 chunks
Budget (firstLoadSharedKb):     133 KB   ← ratcheted down from 145
```

Nine passes of the script printing _"ratchet toward 133 to lock in the reduction"_, now acted
on. The measured figure has not moved in nine passes; the budget now reflects that rather than
leaving 17.6 KB of unearned headroom.

### 2.4 Authorization model

Unchanged in shape, and now verified far more thoroughly:

```
hard rule  >  explicit deny  >  explicit allow  >  persona default
```

- **App layer**: 69 E2E specs including negative sweeps, positive controls and API scoping.
- **Database layer**: **64 RLS assertions**, now covering guardians (PII), subjects, the financial system-of-record, and mentee_notes — with a parity test ensuring no RLS-enabled table ships unasserted.

`0078` is a good example of the model being applied thoughtfully: notes are **read** through an
RLS policy, but have **no insert/update/delete policy at all** — writes go service-role only,
gated by `canMentor` in the app, _"so the Data API can't forge or alter a note."_ Removing the
write surface entirely is stronger than writing a policy for it.

---

## 3. Open Findings

---

### NEW-34 · `mentee_notes` and data-subject access — 🟢 Low _(observation, not a defect)_

`0078_mentee_notes.sql` is well designed and well documented:

> Readable by the student's mentor(s) and admins; **NEVER by the student**, and not by tutors
> (unless they also mentor the student).

As an application access rule this is correct — pastoral observation needs candour, and a note
a student can read is a note that will not be written honestly.

**The observation is about the layer above the application.** Under DPDP — and the privacy work
in the previous window shows the team is engaging with it seriously — pastoral notes about a
student are that student's personal data, and a data principal generally has a right of access
to personal data concerning them. Most regimes allow that right to be narrowed (third-party
data, confidential references, safeguarding), but the narrowing usually has to be a
**documented position**, not an absence.

So: the app should keep doing exactly what it does. What is missing is a line in the privacy
documentation saying how a subject-access request touching pastoral notes is handled, and on
what basis any material is withheld.

**Not legal advice** — this is a flag that the question exists and currently has no written
answer, alongside a privacy posture that answers most others.

**Recommendation:** add a short section to the privacy documentation covering pastoral notes:
who can see them, why the student cannot in-app, and the process for a subject-access request.
~30 minutes, and it closes the gap between a good technical control and a defensible position.

---

### FIND-29 · No dark mode, fifteenth pass — 🟡 Medium

`grep -rc "dark:" src --include=*.tsx` → **0**, while `src/app/layout.tsx` still declares a dark
`themeColor`. The app tells the browser it has a dark appearance and then renders light in
every case.

This is now the only Medium finding, and it has outlived every other item raised in this audit.
The design-token layer added in revision 12 is the foundation an implementation would need.

**Recommendation — pick one and close it:**

1. **Implement it** on the token layer: define the dark palette against the existing tokens, migrate `src/lib/ui` first (that covers most surfaces), then route-level components.
2. **Delete the dark `themeColor`** — one line, and the app stops advertising something it does not do.

Either is defensible. Fifteen passes of neither is the only outcome that is not.

---

### Remaining carried findings

| ID                         | Finding                                                                                 | Severity | Note                                                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FIND-35**                | Restore drill scripted, not yet run against a real backup.                              | 🟢 Low   | Now one command (`scripts/restore-drill.sh`), with a `--rehearse` mode. The remaining step is a real Supabase restore plus a separate check that custodial Drive attachments return — the script's own header says so. Record the RTO. |
| **FIND-32**                | No automated a11y check.                                                                | 🟢 Low   | The E2E suite is green, gated, and uploads artifacts; `@axe-core/playwright` is a drop-in.                                                                                                                                             |
| **Cron wiring**            | Email drain and attachment reconcile are manual deploy-time steps.                      | 🟢 Low   | Documented in `deployment.md` §5 with consequences, and queue-health monitoring now alarms if they stall.                                                                                                                              |
| **NEW-06**                 | Matrix-persona reads sequential (bounded at 5).                                         | 🟢 Low   |                                                                                                                                                                                                                                        |
| **FIND-09 / FIND-10**      | `src/features` documented but never built; mock harness in the production module graph. | 🟢 Low   |                                                                                                                                                                                                                                        |
| **FIND-31 / 44 / 45 / 46** | Blog JSX; no global search; footer mojibake; no in-app help.                            | 🟢 Low   |                                                                                                                                                                                                                                        |

---

## 4. Security Audit (Phase 3)

| Control                                  | State                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dependency vulnerabilities**           | ✅ **0**.                                                                                                                                   |
| **Database-layer authorization**         | ✅ **64 assertions** — nearly double last pass — now covering PII (guardians), the financial system-of-record, subjects and pastoral notes. |
| **RLS coverage cannot silently regress** | ✅ `rls-coverage-parity.test.ts`, with a **shrink-only** exempt list.                                                                       |
| **App-layer authorization**              | ✅ 69/69 E2E.                                                                                                                               |
| **Write-surface removal**                | ✅ `mentee_notes` has no insert/update/delete policy — the Data API cannot forge or alter a note.                                           |
| **Self-directed re-audit**               | ✅ `7953067` fixes R-04, R-12 and A-07 from the team's own security re-audit.                                                               |
| **CSP**                                  | ✅ Nonce-based, `'strict-dynamic'`, preserved across redirects.                                                                             |
| **Consent records**                      | ✅ New data + service layer.                                                                                                                |
| **Secrets / telemetry**                  | ✅ None in git; PII stripped from Sentry.                                                                                                   |

**No OWASP category carries a confirmed open defect**, and the database half of access control
is now verified at roughly twice the depth of any prior pass.

---

## 5. Performance Audit (Phase 4)

First-load **127.4 KB against a tightened 133 KB budget**. Everything else unchanged and
strong: email queued off the request path with atomic claiming, org settings cached, dashboards
batched, 304 on unchanged finance PDFs, queue-health monitoring.

**Open:** the bounded matrix-persona loop (NEW-06) — five sequential reads, unchanged since
revision 3 and still the only known query-shape inefficiency.

---

## 6. Maintainability (Phase 5)

| Principle                       | Assessment                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mechanical over documentary** | ✅ **Now the default.** Both findings closed this pass produced a guard, not a fix: a parity test and a drill script. The project no longer needs to be told.     |
| **Ratchets over thresholds**    | The exempt list may only shrink; the bundle budget tightened to the measured value; coverage raised rather than patched. Three different controls, same instinct. |
| **Write-surface minimisation**  | `mentee_notes` has no write policy because writes do not belong on the Data API.                                                                                  |
| **Self-audit**                  | Security findings now originate in-house, tracked by ID, and are referenced in the commits that fix them.                                                         |
| **SRP / OCP / DRY / KISS**      | **Strong**, unchanged.                                                                                                                                            |

### Module scorecard

| Module                                                                  |  R13  |   R14   |     R15     | Note                                                     |
| ----------------------------------------------------------------------- | :---: | :-----: | :---------: | -------------------------------------------------------- |
| `src/lib/capabilities` / `permission`                                   |  10   |   10    |   **10**    |                                                          |
| `src/lib/security` / `observability`                                    |  10   |   10    |   **10**    |                                                          |
| `src/proxy.ts` / `attachments`                                          |  10   |   10    |   **10**    |                                                          |
| `src/app/components`                                                    |   —   |    8    |   **10**    | +2: `useSyncExternalStore` fix                           |
| `src/app/(prt)`                                                         |   9   |    9    |    **9**    |                                                          |
| `src/lib/data` / `services` / `api` / `auth` / `session` / `validation` |   9   |   10    |   **10**    | Consents, guardians, mentee notes                        |
| `src/lib/ui`                                                            |   9   |    9    |    **9**    | −1: still no dark-mode implementation on the token layer |
| `supabase/migrations` / `rebuild`                                       | 9 / 6 | 10 / 10 | **10 / 10** | Chain `0079`, snapshot current                           |
| `scripts/` + `.githooks/`                                               |   7   |   10    |   **10**    | Restore drill added                                      |
| `scripts/test-rls.sh`                                                   |   —   |    7    |   **10**    | +3: 34 → 64 assertions, parity-gated                     |
| `src/lib/mock`                                                          |   4   |   10    |   **10**    |                                                          |
| `tests/unit`                                                            |   8   |   10    |   **10**    | 1,161 tests; two parity guards                           |
| `tests/e2e`                                                             |   6   |   10    |   **10**    | 69/69                                                    |
| `.github/`                                                              |  10   |   10    |   **10**    |                                                          |
| `docs/`                                                                 |  10   |   10    |   **10**    | −0; see NEW-34 for the one gap                           |

---

## 7. Documentation (Phase 6)

Strong and self-directed. The documentation set covers navigation (`where-to-find-what.md`),
operations, deployment, environment, a production checklist, 6 ADRs with correct supersession,
FK/cascade and RLS inventories, a hook-backed migration checklist, and the team's own security
audits.

**Two small gaps:**

- `docs/operations.md` still describes the restore drill as a manual annual procedure; it should now point at `scripts/restore-drill.sh` and carry the recorded RTO once the drill is run.
- No written position on pastoral-notes access (NEW-34).

---

## 8. Debugging Experience (Phase 7)

Complete: structured logs → Sentry with request-id correlation and PII stripped, CI report
artifacts, queue-health monitoring.

---

## 9. Database Review (Phase 8)

**Schema:** chain `0001`–`0079`, RLS on every table, snapshot current, `pg_cron` retention and
email drain, **64 harness assertions** with a parity test preventing regression.

`0078_mentee_notes` is the standout migration: it explains _why_ the table exists (a mentor's
pastoral channel is attached to the student, not the tutor's session), states exactly who may
read it, and deliberately omits write policies with the reasoning recorded.

---

## 10. Frontend Review (Phase 9)

The CookieNotice fix used `useSyncExternalStore` with a server snapshot — the correct hook for
"read a client-only value without a hydration mismatch or a cascading render" — rather than
suppressing the rule.

| ID          | Finding                       | Severity  |
| ----------- | ----------------------------- | --------- |
| **FIND-29** | No dark mode (fifteenth pass) | 🟡 Medium |
| **FIND-32** | No automated a11y check       | 🟢 Low    |

---

## 11. Backend Review (Phase 10)

Unchanged in shape and steadily hardened: consent records, guardian contacts, pastoral notes
with a service-role-only write path, session notes, further auth-cookie hardening, and three
fixes from the team's own RLS re-audit.

---

## 12. DevOps Review (Phase 11)

Three CI jobs, executable hooks, queue-health monitoring, and now a restore-drill script. **All
gates green.**

The one insurance item still worth adding, carried from revision 13: a CI assertion that the
hooks remain mode `100755`, so a future squash cannot silently drop them the way one already
did.

---

## 13. Testing Review (Phase 12)

| Type               | R13          | R14        | R15                                   |
| ------------------ | ------------ | ---------- | ------------------------------------- |
| Unit / integration | 123, 953     | 150, 1,154 | ✅ **153 files, 1,161**               |
| Coverage           | ❌ 70.75%    | 77.1%      | ✅ **76.96% lines · 64.04% branches** |
| E2E                | ❌ 49 failed | 69/69      | ✅ **69 / 69**                        |
| RLS                | 34           | 34         | ✅ **64 passed**                      |
| Restore drill      | —            | —          | ✅ **scripted** (not yet run)         |

The RLS expansion is the substantive win: assertions now cover the data that would matter most
in a breach — guardian contact details for minors, the financial system-of-record, and pastoral
notes. Coverage dipped 0.14 points, which is noise within a healthy margin.

---

## 14. UX Review (Phase 13)

Guardian contacts in the admin user detail, staff session notes, consent records, refreshed
privacy/terms/register copy.

| ID                | Finding                                           | Severity  |
| ----------------- | ------------------------------------------------- | --------- |
| **FIND-29**       | No dark mode (fifteenth pass)                     | 🟡 Medium |
| **FIND-44/45/46** | No global search; footer mojibake; no in-app help | 🟢 Low    |

---

## 15. Scalability Review (Phase 14)

| Dimension                            | Assessment                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Concurrency / horizontal scaling** | **Good.** Atomic queue claiming.                                                                                                                  |
| **Request path**                     | **Good.**                                                                                                                                         |
| **Large database**                   | Growth tables bounded by retention. Index inventories for `guardians`, `subjects`, `mentee_notes`, `attachments`, `entity_tags` still unexamined. |
| **Client payload**                   | ✅ 127.4 KB against a tightened 133 KB budget.                                                                                                    |
| **Backup/restore**                   | ✅ Scripted; not yet exercised.                                                                                                                   |

---

## 16. Complexity Analysis (Phase 15)

**Over-engineering:** none.

**Under-engineering — the table that has driven this audit since revision 9:**

| Control            | R13             | R14             | R15                      |
| ------------------ | --------------- | --------------- | ------------------------ |
| Snapshot freshness | May not execute | ✅ Executable   | ✅ Current at `0079`     |
| Formatting         | ✅              | ✅              | ✅                       |
| Mock parity        | ❌ Rule only    | ✅ Unit test    | ✅                       |
| Coverage           | ❌ Breached     | ✅ Floor raised | ✅                       |
| RLS assertions     | ❌ 34 of 76     | ❌ 34 of 76     | ✅ **64 + parity test**  |
| Restore drill      | ❌ Never run    | ❌ Never run    | ⚠️ **Scripted, not run** |

Six of six now have a mechanism. One still needs to be executed once.

---

## 17. Prioritised Action Plan (Phase 18)

### 🟡 Medium

**M1 · Close dark mode either way** — FIND-29 · fifteenth pass · implement on the token layer,
or delete the dark `themeColor` (one line). Continuing to advertise a dark appearance the app
does not render is the only outcome worth ruling out.

### 🟢 Low

| ID  | Action                                                                                                                                                  | Finding          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| L1  | Run `scripts/restore-drill.sh` against a real Supabase backup; record the RTO in `operations.md`; separately confirm custodial Drive attachments return | FIND-35          |
| L2  | Write the pastoral-notes access position into the privacy documentation                                                                                 | NEW-34           |
| L3  | Add a CI assertion that hooks stay mode `100755`                                                                                                        | R13 carry        |
| L4  | `@axe-core/playwright` assertions                                                                                                                       | FIND-32          |
| L5  | Index review for `guardians`, `subjects`, `mentee_notes`, `attachments`, `entity_tags`                                                                  | §15              |
| L6  | Batch the matrix-persona reads                                                                                                                          | NEW-06           |
| L7  | Mark `src/features` PLANNED or remove it                                                                                                                | FIND-09          |
| L8  | Blog content → MDX; footer mojibake; global search; in-app help                                                                                         | FIND-31/45/44/46 |

---

## 18. Quick Wins

1. **Delete the dark `themeColor`** if dark mode isn't planned — 5 min; ends a fifteen-pass mismatch. _(M1)_
2. **CI hook-mode assertion** — 5 min; insurance against a guard that was silently dropped once. _(L3)_
3. **`bash scripts/restore-drill.sh --rehearse`** — 15 min; proves the cycle works before the real drill. _(L1)_
4. **Pastoral-notes privacy paragraph** — 30 min. _(L2)_
5. **`@axe-core/playwright`** — 1 h; the suite is green, gated, and uploading artifacts. _(L4)_

---

## 19. Long-Term Improvements

1. **Run the restore drill.** It is now one command. The finding has been open since revision 4 and is the last control that exists but has never been exercised.
2. **Dark mode or drop the claim.** Fifteen passes.
3. **Multi-tenancy readiness.** Subjects, guardians, consents, multi-currency, custodial storage and per-slot timezones all point at a product that will need tenant scoping; `org_settings` is still single-row by constraint.

---

## 20. Overall Scorecard (Phase 16)

| Dimension                  |   R12   |   R13   |   R14   |   R15   | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | :-----: | :-----: | :-----: | :-----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**           |    9    |    9    |    9    |  **9**  | Pastoral notes and consents fit the model cleanly. −1 for the unbuilt `src/features`.                                                                                                                                                                                                                                                                                                                                                        |
| **Security**               |   10    |    8    |   10    | **10**  | 64 RLS assertions covering PII, finance and pastoral data; a parity test preventing regression; write surfaces removed rather than policed; in-house re-audit findings fixed.                                                                                                                                                                                                                                                                |
| **Maintainability**        |    9    |    9    |   10    | **10**  | Mechanical-over-documentary is now the default response, not a recommendation.                                                                                                                                                                                                                                                                                                                                                               |
| **Performance**            |   10    |   10    |   10    | **10**  | Budget ratcheted to the measured value.                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Scalability**            |    9    |    9    |    9    |  **9**  | Index inventories still unexamined.                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Documentation**          |   10    |   10    |   10    |  **9**  | −1: `operations.md` predates the drill script, and pastoral-notes access has no written position.                                                                                                                                                                                                                                                                                                                                            |
| **Testing**                |   10    |    6    |    9    | **10**  | 1,161 unit + 64 RLS + 69 E2E, all green, with two parity guards and a drill script.                                                                                                                                                                                                                                                                                                                                                          |
| **Developer Experience**   |    8    |    7    |    9    | **10**  | Every gate green; every recurring failure now has a mechanism.                                                                                                                                                                                                                                                                                                                                                                               |
| **User Experience**        |   10    |    9    |   10    |  **9**  | −1: dark mode, fifteenth pass.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Code Quality**           |    9    |    9    |    9    | **10**  | Eleven of eleven gates green, 0 warnings, 0 vulnerabilities.                                                                                                                                                                                                                                                                                                                                                                                 |
|                            |         |         |         |         |                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Overall Project Health** | **9.4** | **8.8** | **9.5** | **9.7** | The first fully green pass in fifteen. Both findings were closed with a mechanism rather than a fix — a parity test with a shrink-only exemption list, and a restore drill reduced to one command. RLS assertions nearly doubled and now cover guardian PII, the financial system-of-record and pastoral notes. What remains is a genuinely short tail: one Medium that is a decision rather than work, and a drill that needs running once. |

---

## 21. Strengths

1. **Every gate green** — 1,161 unit tests, 64 RLS assertions, 69 E2E specs, clean build, ratcheted bundle, current snapshot, zero vulnerabilities.
2. **The exempt list may only shrink.** `rls-coverage-parity.test.ts` closes the escape hatch that would otherwise let a new table opt out of RLS assertions.
3. **RLS assertions nearly doubled**, and they were pointed at the right data first — guardian PII for minors, the financial system-of-record, pastoral notes.
4. **The write surface was removed, not policed** — `mentee_notes` has no insert/update/delete policy, so the Data API cannot forge or alter a note.
5. **The restore drill anticipated the gap I raised in revision 10** — its header explicitly says custodial Drive attachments must be verified separately, because they live outside the DB backup.
6. **The lint fix used the right hook**, `useSyncExternalStore` with a server snapshot, rather than suppressing a rule the project benefits from.
7. **The bundle ratchet was finally taken** — the budget now reflects nine passes of stable measurement instead of unearned headroom.
8. **Security findings now originate in-house**, tracked by ID and referenced in the commits that fix them.
9. **Migration `0078` explains itself** — why the table exists, who may read it, and why it has no write policy.
10. **Commits that name their findings**, fifteen passes running.

---

_Revision 15 performed 2026-08-25 against `feature/cert-ed-academia-app` @ `5e23697` with a
clean working tree, a clean `rm -rf .next` rebuild, and **serial** execution of every gate
(learning from revision 14, where concurrent runs contaminated two measurements). Not verified:
whether the Sentry DSNs are configured in Vercel, whether the drain/reconcile crons are wired on
the production project, and whether the restore drill has been run against a real backup._
