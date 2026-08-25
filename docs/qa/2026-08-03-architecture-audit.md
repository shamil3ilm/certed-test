# Cert-Ed Academia — Full Architecture & Codebase Audit

- **Date:** 2026-08-25 · **Revision 14** (living document; supersedes revisions 1–13. Filename reflects the first pass.)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `4ab16dd` · **working tree clean**
- **Method:** read-only static analysis + live execution of `build` (clean `.next`), `typecheck`, `test:coverage`, `lint`, `format:check`, `check:bundle`, `check-snapshot-freshness`, `playwright test`, `npm audit`, and `scripts/test-rls.sh` against real Postgres 18
- **Scope:** Phases 1–19 of the audit brief

---

## 0. Revision 14 — every finding from last pass closed; one lint error left

Twenty-five commits, dominated by **security hardening and privacy work**, plus migrations
`0065`–`0076`.

**All four findings from revision 13 are closed**, and three of them were closed with the
mechanical fix rather than the instance fix — including the mock-parity unit test that
converts a checklist item into a gate. Coverage did not just recover, it jumped from 70.75% to
**77.1%** lines.

One gate is red: a single lint error in the new cookie notice.

### Verification results

| Command                 | R11   | R12      | R13           | R14                                 |
| ----------------------- | ----- | -------- | ------------- | ----------------------------------- |
| `npm run typecheck`     | ✅    | ✅       | ✅            | ✅                                  |
| `npm run lint`          | ✅    | ✅       | ✅            | ❌ **1 error**                      |
| `npm run format:check`  | ✅    | ❌ 10    | ✅            | ✅                                  |
| `npm test`              | 876   | 924      | 953           | ✅ **1,154 passed (150 files)**     |
| `npm run test:coverage` | ✅    | ✅       | ❌ 3 breached | ✅ **77.1% lines · 64.2% branches** |
| `npm run build`         | ✅    | ✅       | ✅            | ✅ **0 warnings**                   |
| `npm run check:bundle`  | ✅    | ✅       | ✅            | ✅ **127.4 / 145 KB**               |
| `npx playwright test`   | ❌ 1  | ✅ 65/65 | ❌ 49 failed  | ✅ **69 / 69**                      |
| Snapshot freshness      | ✅    | ❌       | ❌ 6th        | ✅ **0076 current**                 |
| `scripts/test-rls.sh`   | ✅ 34 | ✅ 34    | ✅ 34         | ✅ **34 passed**                    |
| `npm audit --omit=dev`  | ✅    | ✅       | ✅            | ✅ **0**                            |

> **A measurement note on this pass.** I initially recorded 28 RLS failures and 9 E2E
> failures. Both were artifacts of my own concurrent execution — two `test-rls.sh` runs share
> one hardcoded database name and dropped it out from under each other, and the E2E run was
> competing with a migration replay for CPU (specs timing out at 15s that pass in 0.4s when
> run alone). Re-run serially, both are clean. **The figures above are from isolated runs.**

### Findings closed this pass

| ID            | Finding                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NEW-29** 🔴 | Mock harness missing `subjects` → 49 of 65 E2E specs failing | ✅ **Closed twice over.** `subjects` is seeded, and — more importantly — **`tests/unit/mock-schema-parity.test.ts`** now asserts migration tables have mock counterparts. That is recommendation #2 from revision 13: it converts `migration-checklist.md` item 4 from a habit into a gate that runs in the existing `verify` job. E2E back to **69/69**. |
| **NEW-28** 🟡 | Both git hooks committed non-executable — carried two passes | ✅ `git ls-files -s .githooks/` → **`100755`** on both `pre-commit` and `pre-push`. The guards are now real on Unix, not just Windows.                                                                                                                                                                                                                    |
| **NEW-30** 🟠 | Coverage ratchet breached — second occurrence                | ✅ **Closed with headroom, not a patch.** Lines **70.75 → 77.1**, branches **56.85 → 64.2**, tests **953 → 1,154** across 27 new files. This is the one-time push recommended in revision 13 rather than another 1-point repair.                                                                                                                          |
| **NEW-31** 🟠 | Snapshot stale, sixth occurrence                             | ✅ Current at `0076`, through twelve new migrations. With the hooks now executable, the guard is finally operating as designed.                                                                                                                                                                                                                           |

### New finding

| ID         | Finding                                                                                                                                       | Severity |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **NEW-33** | `npm run lint` fails with one `react-hooks/set-state-in-effect` error in `src/app/components/CookieNotice.tsx` — CI red at step 2 of `verify` | 🟠 High  |

### Carried

| ID          | Finding                                                                                                                                                                               | Severity  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **NEW-32**  | RLS harness holds at **34 assertions** while the schema now defines **76 policies**. `subjects` and `guardians` have **zero** assertions — and `guardians` holds student contact PII. | 🟡 Medium |
| **FIND-35** | Restore drill documented but never performed                                                                                                                                          | 🟡 Medium |
| **FIND-29** | No dark mode — `grep "dark:"` → **0**, **fourteenth pass**                                                                                                                            | 🟡 Medium |
| **M5**      | Bundle ratchet 145 → 133 not taken — **ninth pass**                                                                                                                                   | 🟢 Low    |

---

## 1. Executive Summary

Cert-Ed Academia is a Next.js 16 App Router monolith serving two hosts from one codebase: a
public marketing site (`certedacademia.com`) and a private academy portal
(`app.certedacademia.com`), on Supabase (Auth + Postgres with RLS) and Vercel.

This is the strongest remediation pass in the series. Every finding from revision 13 is closed,
and the pattern I have been pushing for since revision 9 — **make the rule mechanical** — was
applied to the one that kept recurring. The mock-parity unit test is the right shape: it costs
seconds, runs in the existing job, and cannot be forgotten.

The window itself is heavily security- and privacy-oriented: a spoofable rate-limit IP fixed,
a PostgREST `.or()` escaper, sub-admin read confinement, auth-cookie hardening, PII kept out of
Sentry, atomic drain-queue claims to stop double-sends, an alarm on disabled RLS, and DPDP data
minimisation (gender and address dropped from collection entirely). The team is now running
**its own security audit** with 28 tracked findings and remediation status.

| #   | Problem                                                                             | Severity  |
| --- | ----------------------------------------------------------------------------------- | --------- |
| 1   | One lint error blocks CI                                                            | 🟠 High   |
| 2   | RLS assertions (34) not keeping pace with policies (76); `guardians` PII unasserted | 🟡 Medium |
| 3   | Restore drill documented but never performed                                        | 🟡 Medium |
| 4   | No dark mode, while the app advertises a dark `themeColor`                          | 🟡 Medium |
| 5   | Bundle ratchet not taken                                                            | 🟢 Low    |

**Overall project health: 9.5 / 10** (…8.8 → 9.5). The largest single-pass recovery in the
series.

---

## 2. Project Overview (Phase 1)

### 2.1 Stack

| Concern       | Technology                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 16.3, App Router, Turbopack build                                                                                   |
| Language      | TypeScript 5, `strict: true`                                                                                                |
| UI            | React 19.2, Tailwind CSS v4, design-system tokens                                                                           |
| Edge          | `src/proxy.ts` — host split, session refresh, auth gate, per-request CSP nonce, cookie-preserving redirects                 |
| Database      | Supabase Postgres, RLS on every table, chain `0001`–`0076`, **76 policies**, `pg_cron` retention + email drain              |
| Auth          | Supabase Auth, allowlist-first, **hardened cookies; mock-auth fails closed off Vercel**                                     |
| File storage  | Custodial — academy-owned Google Drive (ADR-0006)                                                                           |
| Privacy       | Privacy & terms pages, cookie + contact notices, **DPDP data minimisation**                                                 |
| Validation    | Zod v4                                                                                                                      |
| Email         | Resend, drained from a queue with **atomic row claiming**                                                                   |
| Observability | `logError` → stderr + Sentry, request-id correlated, **PII stripped**; queue-health monitoring                              |
| Testing       | Vitest 4 (150 files, 1,154 tests) + coverage ratchet + Playwright (**69 specs, all passing**) + RLS harness (34 assertions) |
| CI            | `verify` + `e2e` + `rls` jobs; **executable** pre-commit and pre-push hooks                                                 |
| Hosting       | Vercel, region `bom1`                                                                                                       |

### 2.2 What shipped this window

**Security** (`a42457c`, `22ff1ea`, `c8aa1bf`, `a0fcfb2`, `927bb6b`, `c6d6926`, `09bd124`,
`f533cb4`, `2b4b4e8`): the `.or()` grammar escaper, non-spoofable client IP, contact-error
masking, sub-admin read confinement to tutor/student, auth-cookie hardening, PII out of the
error tracker, attachment schema-fault surfacing plus an alarm on disabled RLS, session tutor
attribution validation, attachment writes gated on the owner's own rules, atomic drain-queue
claims, and Organization settings restricted to the admin tier.

**Privacy/legal** (`57dc848`, `e3eec88`, `728cc50`, `e21e016`): privacy and terms pages served
on the portal host, cookie and contact notices, and data minimisation — gender and address
dropped from collection and from the schema (`0072`), student phone kept but marked optional.

**Features**: multiple guardian contacts per student (`0076`), navigation grouped into
sections, a narrow `manageAttendance` capability letting mentors edit attendance without
widening their oversight role, plus assignments/calendar/attendance/multi-tutor/analytics work.

### 2.3 Bundle profile

```
First-load shared JS (gzipped): 127.4 KB across 4 chunks
Budget (firstLoadSharedKb):     145 KB · headroom 17.6 KB
```

Flat across nine passes. The ratchet suggestion has now printed nine times.

### 2.4 Authorization model

Unchanged in shape, with one well-judged addition. `manageAttendance` is a **narrow** new
capability rather than a widening of the mentor persona — mentors gain exactly the ability to
edit attendance and nothing else. That is the correct instinct: the alternative (granting
`manageClassContent`) would have handed mentors write access to the whole class workspace.

---

## 3. Open Findings

---

### NEW-33 · One lint error blocks CI — 🟠 High

```
src/app/components/CookieNotice.tsx
  20:54  error  Calling setState synchronously within an effect can trigger cascading renders
                react-hooks/set-state-in-effect
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

`lint` is the second step of the `verify` job, so typecheck, coverage, build and bundle never
run on this commit.

**The rule is flagging a real pattern, and the fix is genuinely non-obvious here.** The value
cannot be read during render — `localStorage` does not exist during SSR, and reading it in a
`useState` initialiser would cause a hydration mismatch. The effect is the conventional
workaround, which is why this pattern is so common.

**Recommendation — two clean options:**

1. **`useSyncExternalStore`** with a server snapshot, which is what React added for exactly this case:
   ```tsx
   const dismissed = useSyncExternalStore(
     subscribe,
     () => localStorage.getItem(DISMISS_KEY) === '1', // client
     () => true, // server: assume dismissed, render nothing
   )
   ```
   Renders nothing on the server, no cascading render, no hydration mismatch, no suppression.
2. **Keep the effect and suppress the rule on that line with a comment** explaining why one extra render is intended. Legitimate, but it spends a rule the project otherwise benefits from.

Option 1 is preferable — the notice is a small component and the hook exists for this exact
problem.

---

### NEW-32 · RLS assertions are not keeping pace with policies — 🟡 Medium _(carried, widening)_

| Metric                 | R10 | R13 | R14    |
| ---------------------- | --- | --- | ------ |
| Policies in `public`   | —   | —   | **76** |
| Harness assertions     | 34  | 34  | **34** |
| `subjects` assertions  | —   | 0   | **0**  |
| `guardians` assertions | —   | —   | **0**  |

Twelve migrations have landed since the assertion count last moved. Two tables now carry
policies that nothing exercises:

- **`guardians` (`0076`)** — multiple guardian contacts per student. This is **student contact PII for minors**, guarded by a `guardians_read` policy with no assertion behind it. Given the DPDP work in this same window, it is the table where a policy error would matter most.
- **`subjects` (`0064`)** — flagged in revision 13, still unasserted.

The harness is excellent and runs on every push; the gap is that it is not being extended
alongside the policies it exists to verify. This is the same shape as the mock-parity problem
that was just solved well — and it suggests the same remedy.

**Recommendation:**

1. Add assertions for `guardians` first (a guardian row is visible to staff who may see the student, and to nobody else) and `subjects` second.
2. **Consider the mechanical version**, mirroring `mock-schema-parity.test.ts`: a test that every table with `enable row level security` in the migration chain is named at least once in `scripts/test-rls.sh`. It would not prove the assertions are _good_, but it would stop a policy shipping with no coverage at all — which is the failure mode here.

---

### Remaining carried findings

| ID                   | Finding                                                                                                        | Severity  | Note                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FIND-35**          | Restore drill still not performed.                                                                             | 🟡 Medium | [docs/operations.md](docs/operations.md) scripts it and says what to record. Now more consequential: custodial attachments and guardian PII both need to come back consistently. |
| **FIND-29**          | No dark mode — `grep "dark:"` → **0** across fourteen passes, while `layout.tsx` declares a dark `themeColor`. | 🟡 Medium | The design-token layer from R12 is the foundation; or delete the dark `themeColor` in one line.                                                                                  |
| **Cron wiring**      | Email drain and attachment reconcile are manual deploy-time steps.                                             | 🟡 Medium | Documented in `deployment.md` §5 with consequences; queue-health monitoring (`ecb550a`) now alarms if they stall, which materially reduces the risk.                             |
| **M5**               | Ratchet `firstLoadSharedKb` 145 → 133.                                                                         | 🟢 Low    | Ninth pass.                                                                                                                                                                      |
| **FIND-09/10**       | `src/features` never built; mock harness in the production module graph.                                       | 🟢 Low    |                                                                                                                                                                                  |
| **NEW-06**           | Matrix-persona reads sequential (bounded at 5).                                                                | 🟢 Low    |                                                                                                                                                                                  |
| **FIND-32**          | No automated a11y check.                                                                                       | 🟢 Low    | Suite is green and gated with artifacts — `@axe-core/playwright` drops straight in.                                                                                              |
| **FIND-31/44/45/46** | Blog JSX; no global search; footer mojibake; no in-app help.                                                   | 🟢 Low    |                                                                                                                                                                                  |

---

## 4. Security Audit (Phase 3)

**The strongest security window in the series.** Nine hardening commits, and the team is now
running its own audit — [docs/qa/2026-08-20-security-audit.md](docs/qa/2026-08-20-security-audit.md)
tracks **28 findings** (A-01…A-15, B-01…B-13) with remediation status.

| Control                           | State                                                                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dependency vulnerabilities**    | ✅ **0**.                                                                                                                                                                   |
| **Client IP no longer spoofable** | ✅ `clientIp()` prefers `x-vercel-forwarded-for`, else the **rightmost** XFF entry (appended by the trusted proxy) rather than the client-controlled leftmost. Correct fix. |
| **PostgREST `.or()` injection**   | ✅ `escapeOrIlike` — grammar characters no longer survive into the filter.                                                                                                  |
| **Sub-admin read scope**          | ✅ Confined to tutor/student on user reads.                                                                                                                                 |
| **Auth cookies**                  | ✅ Hardened; mock-auth **fails closed** off Vercel.                                                                                                                         |
| **PII in telemetry**              | ✅ Emails and IPs kept out of the error tracker — the right call given DPDP.                                                                                                |
| **Attachment writes**             | ✅ Gated on the owner's own write rules.                                                                                                                                    |
| **Disabled-RLS alarm**            | ✅ `927bb6b` alarms if RLS is off on a table — a control that watches the controls.                                                                                         |
| **Email double-send**             | ✅ Drain-queue rows claimed atomically.                                                                                                                                     |
| **Error masking**                 | ✅ `/api/contact` no longer reflects the upstream Apps Script error.                                                                                                        |
| **Database-layer authorization**  | ✅ 34 assertions passing — but only 34 against 76 policies (NEW-32).                                                                                                        |
| **App-layer authorization**       | ✅ **69/69 E2E**, including negative sweeps, positive controls and API scoping.                                                                                             |

**Privacy:** data minimisation is real, not cosmetic — gender and address were removed from
validation, forms, display _and_ the schema (`0072`). Collecting less is the strongest privacy
control available, and it was chosen over access controls on data that need not exist.

**No OWASP category carries a confirmed open defect.**

---

## 5. Performance Audit (Phase 4)

Unchanged and strong: first-load flat at 127.4 KB through another large window, email queued
off the request path with atomic claiming, org settings cached, dashboards batched, 304 on
unchanged finance PDFs.

Queue-health monitoring (`ecb550a`) is new and closes a real gap — the queues could previously
stall silently if their cron was not wired.

---

## 6. Maintainability (Phase 5)

| Principle                                         | Assessment                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Escalation follow-through**                     | ✅ **Fixed, and this is the headline.** Revisions 9–13 kept finding rules that existed but were not enforced. This pass took the recommended step: `mock-schema-parity.test.ts` makes checklist item 4 mechanical, and the hooks were made executable so the other guards actually run. |
| **Quality response proportionate to the problem** | Coverage was not patched back to a 1-point margin — it was raised from 70.75% to 77.1% with 201 new tests. That ends a two-pass cycle of repair-and-erode.                                                                                                                              |
| **Least privilege**                               | `manageAttendance` as a narrow capability rather than widening the mentor persona.                                                                                                                                                                                                      |
| **Data minimisation over access control**         | Dropping gender and address entirely, rather than gating them.                                                                                                                                                                                                                          |
| **SRP / OCP / DRY / KISS**                        | **Strong**, unchanged.                                                                                                                                                                                                                                                                  |

### Module scorecard

| Module                                                                  | R12 | R13 |  R14   | Note                                        |
| ----------------------------------------------------------------------- | :-: | :-: | :----: | ------------------------------------------- |
| `src/lib/capabilities` / `permission`                                   | 10  | 10  | **10** | `manageAttendance` well scoped              |
| `src/lib/observability`                                                 | 10  | 10  | **10** | PII stripped; queue health                  |
| `src/lib/security`                                                      | 10  | 10  | **10** | IP, `.or()`, cookies, error masking         |
| `src/proxy.ts`                                                          | 10  | 10  | **10** |                                             |
| `src/lib/attachments`                                                   | 10  | 10  | **10** | Writes gated on owner rules                 |
| `src/lib/ui`                                                            |  9  |  9  | **9**  |                                             |
| `src/app/(prt)`                                                         |  9  |  9  | **9**  |                                             |
| `src/app/components`                                                    |  —  |  —  | **8**  | −2: the lint error (NEW-33)                 |
| `src/lib/data` / `services` / `api` / `auth` / `session` / `validation` |  9  |  9  | **10** | Sub-admin confinement, session attribution  |
| `supabase/migrations`                                                   |  9  |  9  | **10** | Twelve migrations, snapshot current         |
| `supabase/rebuild`                                                      |  6  |  6  | **10** | Current at `0076`                           |
| `scripts/` + `.githooks/`                                               |  7  |  7  | **10** | Hooks executable; guards real               |
| `src/lib/mock`                                                          |  8  |  4  | **10** | Parity now enforced by a unit test          |
| `tests/unit`                                                            | 10  |  8  | **10** | 1,154 tests, 77.1% lines                    |
| `tests/e2e`                                                             | 10  |  6  | **10** | 69/69                                       |
| `scripts/test-rls.sh`                                                   |  —  |  —  | **7**  | −3: 34 assertions against 76 policies       |
| `.github/`                                                              | 10  | 10  | **10** |                                             |
| `docs/`                                                                 | 10  | 10  | **10** | Own security audit with tracked remediation |

---

## 7. Documentation (Phase 6)

Strong and now **self-directed**: the team runs its own security audit
([2026-08-20-security-audit.md](docs/qa/2026-08-20-security-audit.md), 28 tracked findings)
and refreshes remediation status in the commits that fix them. `90542a9` also corrected a
class-write RLS note — documentation being fixed for accuracy rather than only extended.

`e21e016 docs(legal): minimise public policy to category-level disclosure, truth pass` is
notable: a policy document edited so its claims match what the system actually does. That is
the right instinct for a legal artefact.

---

## 8. Debugging Experience (Phase 7)

Complete. Structured logs → Sentry with request-id correlation and PII stripped, CI report
artifacts, and now queue-health monitoring so a stalled drain surfaces rather than accumulating
silently.

---

## 9. Database Review (Phase 8)

**Schema:** chain `0001`–`0076`, **76 RLS policies**, snapshot current, `pg_cron` retention and
email drain, 34 harness assertions passing.

Twelve new migrations. `0072` drops the minimised columns; `0076` adds `guardians`; `0075`
migrates legacy exam events; `0074` adds an assignment `ends_at` check constraint.

| ID         | Finding                                                                  | Severity  | Status            |
| ---------- | ------------------------------------------------------------------------ | --------- | ----------------- |
| **NEW-32** | 34 assertions against 76 policies; `guardians` and `subjects` unasserted | 🟡 Medium | Carried, widening |

---

## 10. Frontend Review (Phase 9)

Navigation grouped into sections (teaching/mentoring/money/admin) — a real information-
architecture improvement as the surface count grows. Privacy and terms pages, cookie notice,
guardian-contacts UI.

| ID          | Finding                          | Severity  |
| ----------- | -------------------------------- | --------- |
| **NEW-33**  | Lint error in `CookieNotice.tsx` | 🟠 High   |
| **FIND-29** | No dark mode (fourteenth pass)   | 🟡 Medium |
| **FIND-32** | No automated a11y check          | 🟢 Low    |

---

## 11. Backend Review (Phase 10)

Unchanged in shape and materially hardened this window: sub-admin read confinement, session
tutor attribution validation, attachment writes gated on owner rules, atomic queue claiming,
admin-tier restriction on Organization settings.

---

## 12. DevOps Review (Phase 11)

Three CI jobs, executable pre-commit and pre-push hooks, queue-health monitoring. CI is red on
one lint error only.

**The guard story has resolved.** Revisions 9–13 tracked a recurring pattern of controls that
existed but did not execute. Both hooks are now `100755`, the mock-parity check is a unit test,
and the snapshot has stayed current through twelve migrations. The remaining suggestion from
revision 13 — a CI assertion on hook mode so a future squash cannot silently drop it — is still
worth adding as insurance.

---

## 13. Testing Review (Phase 12)

| Type               | R12      | R13          | R14                                 |
| ------------------ | -------- | ------------ | ----------------------------------- |
| Unit / integration | 119, 924 | 123, 953     | ✅ **150 files, 1,154**             |
| Coverage           | 73.14%   | ❌ 70.75%    | ✅ **77.1% lines · 64.2% branches** |
| E2E                | ✅ 65/65 | ❌ 49 failed | ✅ **69 / 69**                      |
| RLS                | ✅ 34    | ✅ 34        | ✅ **34 (of 76 policies)**          |

201 new tests across 27 new files. The coverage jump is the right kind of fix — a floor raise
rather than a margin repair, ending the erode-and-restore cycle visible in R8/R9 and R12/R13.

**One structural note for the harness:** `scripts/test-rls.sh` hardcodes a single database name
(`certed_rls_test`) and drops it on start, so two concurrent runs destroy each other. That is
fine for its intended single-run use — it cost me a contaminated measurement this pass, not the
project anything — but if the RLS job is ever parallelised in CI it will need a unique name per
run.

---

## 14. UX Review (Phase 13)

Sectioned navigation, guardian contacts, privacy/terms pages with a cookie notice, and mentors
able to edit attendance without a wider grant.

| ID                | Finding                                           | Severity  |
| ----------------- | ------------------------------------------------- | --------- |
| **FIND-29**       | No dark mode (fourteenth pass)                    | 🟡 Medium |
| **FIND-44/45/46** | No global search; footer mojibake; no in-app help | 🟢 Low    |

---

## 15. Scalability Review (Phase 14)

| Dimension          | Assessment                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Concurrency**    | **Good** — and better: drain-queue rows are now claimed atomically, closing a double-send race.                         |
| **Request path**   | **Good.**                                                                                                               |
| **Large database** | Growth tables bounded by retention; `guardians`, `subjects`, `attachments`, `entity_tags` index inventories unexamined. |
| **Client payload** | ✅ Flat at 127.4 KB.                                                                                                    |
| **Queue health**   | ✅ Monitored — a stalled drain now alarms.                                                                              |

---

## 16. Complexity Analysis (Phase 15)

**Over-engineering:** none.

**Under-engineering — the table that has driven this audit for six revisions:**

| Control            | R13                            | R14                                          |
| ------------------ | ------------------------------ | -------------------------------------------- |
| Snapshot freshness | Guard existed, may not execute | ✅ Executable, current through 12 migrations |
| Formatting         | ✅ Working                     | ✅ Working                                   |
| Mock parity        | Rule only, failed immediately  | ✅ **Unit test — mechanical**                |
| Coverage           | Guard working, margin fragile  | ✅ Floor raised to 77.1%                     |
| RLS assertions     | Not tracked                    | ❌ **34 of 76 policies**                     |
| Restore drill      | Never executed                 | ❌ Still never executed                      |

Five of six now hold. The remaining two are the same shape — a control that exists but is not
kept in step with what it guards.

---

## 17. Prioritised Action Plan (Phase 18)

### 🟠 High

**H1 · Fix the `CookieNotice` lint error** — NEW-33 · ~20 min · prefer `useSyncExternalStore`
with a server snapshot over suppressing the rule.

### 🟡 Medium

| ID  | Action                                                                                                                                    | Finding |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| M1  | Add RLS assertions for `guardians` (PII) and `subjects`; consider a mechanical check that every RLS-enabled table is named in the harness | NEW-32  |
| M2  | Perform the restore drill — now covering attachments and guardian PII                                                                     | FIND-35 |
| M3  | Dark mode on the token layer — or delete the dark `themeColor` (fourteenth pass)                                                          | FIND-29 |
| M4  | Index review for `guardians`, `subjects`, `attachments`, `entity_tags`                                                                    | §15     |
| M5  | Add the hook-mode CI assertion as insurance against a future squash                                                                       | §12     |

### 🟢 Low

| ID  | Action                                                          | Finding          |
| --- | --------------------------------------------------------------- | ---------------- |
| L1  | Ratchet `firstLoadSharedKb` 145 → 133                           | M5 (9 passes)    |
| L2  | `@axe-core/playwright` assertions                               | FIND-32          |
| L3  | Batch the matrix-persona reads                                  | NEW-06           |
| L4  | Mark `src/features` PLANNED or remove it                        | FIND-09          |
| L5  | Blog content → MDX; footer mojibake; global search; in-app help | FIND-31/45/44/46 |

---

## 18. Quick Wins

1. **Fix `CookieNotice`** — 20 min; the only thing between this and a fully green pipeline. _(H1)_
2. **Two `guardians` RLS assertions** — 30 min; the highest-value test gap, because it is PII. _(M1)_
3. **Hook-mode CI assertion** — 5 min; insurance for a guard that was silently dropped once. _(M5)_
4. **Ratchet `firstLoadSharedKb` to 133** — 1 min; nine passes. _(L1)_
5. **Delete the dark `themeColor`** if dark mode isn't planned — 5 min; fourteen passes. _(M3)_

---

## 19. Long-Term Improvements

1. **Keep the RLS harness in step with the policy count.** 34 against 76 is the one control now drifting; the mock-parity test is the template for fixing it.
2. **Restore drill.** Still the one control whose failure mode is total, and its scope keeps growing — custodial files, then guardian PII.
3. **Multi-tenancy readiness.** Subjects, guardians, multi-currency, custodial storage and per-slot timezones all point at a product that will need tenant scoping.

---

## 20. Overall Scorecard (Phase 16)

| Dimension                  |   R11   |   R12   |   R13   |   R14   | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | :-----: | :-----: | :-----: | :-----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**           |    9    |    9    |    9    |  **9**  | Guardians and the narrow `manageAttendance` capability fit the existing model cleanly. −1 for the unbuilt `src/features`.                                                                                                                                                                                                                                                                                                                                                                                         |
| **Security**               |   10    |   10    |    8    | **10**  | Nine hardening commits, a self-run audit with 28 tracked findings, non-spoofable IP, `.or()` escaping, PII out of telemetry, an alarm on disabled RLS, and DPDP minimisation that removes data rather than gating it.                                                                                                                                                                                                                                                                                             |
| **Maintainability**        |   10    |    9    |    9    | **10**  | The escalation follow-through gap — open since revision 9 — is closed.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Performance**            |   10    |   10    |   10    | **10**  | Flat bundle; atomic queue claiming; queue-health monitoring.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Scalability**            |    9    |    9    |    9    |  **9**  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Documentation**          |   10    |   10    |   10    | **10**  | Self-directed security auditing; a legal truth pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Testing**                |    9    |   10    |    6    |  **9**  | 1,154 tests, 77.1% lines, 69/69 E2E. −1: 34 RLS assertions against 76 policies, with PII unasserted.                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Developer Experience**   |   10    |    8    |    7    |  **9**  | Hooks real, parity mechanical, snapshot current. −1 for the red lint gate.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **User Experience**        |    9    |   10    |    9    | **10**  | Sectioned nav, guardian contacts, privacy pages, mentors editing attendance without over-grant.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Code Quality**           |    9    |    9    |    9    |  **9**  | Ten of eleven gates green, 0 warnings, 0 vulnerabilities. −1 for the lint error.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|                            |         |         |         |         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Overall Project Health** | **9.5** | **9.4** | **8.8** | **9.5** | The largest single-pass recovery in the series, and it was earned the right way. Every revision-13 finding is closed, three of them mechanically rather than by hand: the mock-parity unit test, executable hooks, and a coverage floor raised to 77.1% instead of another 1-point patch. The security and privacy work is substantial and self-directed. One lint error stands between this and a fully green pipeline; the one control still drifting is the RLS harness, at 34 assertions against 76 policies. |

---

## 21. Strengths

1. **The escalation finally landed.** `tests/unit/mock-schema-parity.test.ts` converts a checklist item into a gate — the exact recommendation from revision 13, and the pattern this project has now applied successfully to formatting, snapshot drift and mock parity.
2. **Coverage raised, not patched** — 70.75% → 77.1% lines with 201 new tests, ending a two-pass erode-and-restore cycle.
3. **Self-directed security auditing** — 28 tracked findings with remediation status, fixed across nine commits and referenced in the commit messages.
4. **The spoofable-IP fix is correct**, not cosmetic: platform header first, then the rightmost XFF entry rather than the client-controlled leftmost.
5. **Data minimisation over access control** — gender and address removed from collection, forms, display and schema. The strongest privacy control is not holding the data.
6. **A control that watches the controls** — an alarm on disabled RLS.
7. **Least privilege in a new capability** — `manageAttendance` rather than widening the mentor persona.
8. **Atomic queue claiming** to stop double-sends, plus queue-health monitoring so a stalled drain surfaces.
9. **A legal truth pass** — public policy edited so its claims match system behaviour.
10. **69/69 E2E and 34/34 RLS**, both green, both gated in CI.

---

_Revision 14 performed 2026-08-25 against `feature/cert-ed-academia-app` @ `4ab16dd` with a
a working tree clean at the start of the pass, a clean `rm -rf .next` rebuild, and isolated runs of the Playwright suite
(69/69, 2.4m) and `scripts/test-rls.sh` (34/34) against real Postgres 18. Earlier contaminated
figures from concurrent execution were discarded and re-measured. Not verified: whether the
Sentry DSNs are configured in Vercel, and whether the drain/reconcile crons are wired on the
production project. Portal classroom files and a new `docs/qa/2026-08-25-security-reaudit.md`
were modified in the working tree part-way through this pass; those changes are **not covered**
by these results._
