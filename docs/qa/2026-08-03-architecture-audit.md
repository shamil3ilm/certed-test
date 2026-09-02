# Cert-Ed Academia — Full Architecture & Codebase Audit

- **Date:** 2026-08-26 · **Revision 16** (living document; supersedes revisions 1–15. Filename reflects the first pass.)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `fa11762` · **working tree clean**
- **Method:** read-only static analysis + **serial** execution of `typecheck`, `format:check`, `lint`, `npm audit`, `test:coverage`, `test-rls.sh` (real Postgres 18), `build` (clean `.next`), `check:bundle`, `check-snapshot-freshness`, `playwright test`
- **Scope:** Phases 1–19 of the audit brief

---

## 0. Revision 16 — a security-hardening window; one E2E failure that is the mock, not the app

Seven commits, almost entirely **security re-audit round 3** remediation plus production
hardening. Ten of eleven gates green.

The single failure is worth reading carefully: a mentor is denied calendar write in E2E, but
**the product is correct and the mock is wrong** — and the way it went undetected exposes a gap
in the parity guards added over the last two passes.

### Verification results

| Command                 | R13    | R14      | R15      | R16                                   |
| ----------------------- | ------ | -------- | -------- | ------------------------------------- |
| `npm run typecheck`     | ✅     | ✅       | ✅       | ✅                                    |
| `npm run lint`          | ✅     | ❌       | ✅       | ✅                                    |
| `npm run format:check`  | ✅     | ✅       | ✅       | ✅                                    |
| `npm test`              | 953    | 1,154    | 1,161    | ✅ **1,179 (157 files)**              |
| `npm run test:coverage` | ❌     | ✅       | ✅       | ✅ **76.69% lines · 63.77% branches** |
| `npm run build`         | ✅     | ✅       | ✅       | ✅ **0 warnings**                     |
| `npm run check:bundle`  | ✅     | ✅       | ✅       | ✅ **127.4 / 133 KB**                 |
| `npx playwright test`   | ❌ 49  | ✅ 69/69 | ✅ 69/69 | ❌ **1 failed / 68 passed**           |
| Snapshot freshness      | ❌ 6th | ✅       | ✅       | ✅ **0082 current**                   |
| `scripts/test-rls.sh`   | 34     | 34       | 64       | ✅ **67 passed**                      |
| `npm audit --omit=dev`  | ✅     | ✅       | ✅       | ✅ **0**                              |

### What shipped

**Security re-audit round 3** — the team's own findings, fixed and referenced by ID:

| Commit    | Closes                                                                                     |
| --------- | ------------------------------------------------------------------------------------------ |
| `01a0091` | **A-07** — tutor-only content writes; new `canWriteCalendar` for mentor calendar authority |
| `b3d405d` | Submission deadline + Drive-link scheme enforced **at the DB boundary**, not just the app  |
| `5f85d00` | Consent-record honesty, self-update guard, snapshot privilege epilogue                     |
| `3c88285` | Messaging recipients **re-filtered by live profile status**; search escaped                |
| `7e2f19d` | **A-08, A-13, R-03** — read-path PII + input hardening, session read authz                 |
| `6bf9677` | **R-02** — browser cookie adapter + session TTL hardening                                  |
| `71be574` | Production hardening — mock-var guard, queue-health alarm, deploy runbook                  |

`71be574` deserves a specific mention: `assertNoMockConfigInProduction` **refuses a production
deployment carrying any mock-only env var** (`MOCK_MODE`, `ALLOW_MOCK_AUTH`, …), failing both
the build and boot, scoped to `VERCEL_ENV=production` so local E2E and previews are unaffected.
That closes the "mock mode escapes to production" risk class at the deployment boundary rather
than relying on `isMock()`'s runtime checks alone.

### New finding

| ID         | Finding                                                                                                                                                                                                                                                 | Severity |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **NEW-35** | The mock's `teaches_class` RPC has **no mentor branch**, so mock-mode E2E enforces a different authorization rule than production. One spec fails as a result; more importantly, **the parity guards cover tables and policies but not RPC semantics.** | 🟠 High  |

### Still open

| ID                                                              | Finding                                                                                                                                          | Severity  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| **FIND-29**                                                     | No dark mode — `grep "dark:"` → **0**, **sixteenth pass**                                                                                        | 🟡 Medium |
| **FIND-35**                                                     | Restore drill scripted and rehearsed (5/5); **production drill never performed**                                                                 | 🟢 Low    |
| **NEW-34**                                                      | No written position on data-subject access to pastoral notes                                                                                     | 🟢 Low    |
| **FIND-32 / NEW-06 / FIND-09 / FIND-10 / FIND-31 / FIND-44–46** | a11y check; matrix-persona batching; `src/features`; mock harness in the production graph; blog JSX; global search; footer mojibake; in-app help | 🟢 Low    |

---

## 1. Executive Summary

Cert-Ed Academia is a Next.js 16 App Router monolith serving two hosts from one codebase: a
public marketing site (`certedacademia.com`) and a private academy portal
(`app.certedacademia.com`), on Supabase (Auth + Postgres with RLS) and Vercel.

This window was almost entirely defensive: seven commits closing the team's own round-3
security findings, plus a deployment guard that refuses to ship production with mock
configuration present. RLS assertions rose again (64 → 67), and the enforcement of two rules —
submission deadlines and Drive-link schemes — moved from the application down to the database
boundary, which is the right direction.

The one red gate is instructive rather than alarming. Migration `0082` deliberately gives a
mentor calendar-write authority over a mentee's class; the RLS harness confirms the real
database honours it; the E2E spec correctly asserts it; and the spec fails because **the mock's
`teaches_class` is a plain tutor lookup with no mentor branch**. The application is right, the
mock is behind, and the mock's own comment says so.

That matters beyond one spec. The parity guards added in revisions 14 and 15 —
`mock-schema-parity.test.ts` and `rls-coverage-parity.test.ts` — cover _tables_ and _policies_.
Neither covers the **behaviour of the SECURITY DEFINER functions** the app calls by RPC, which
is where authorization actually gets decided.

| #   | Problem                                                                    | Severity  |
| --- | -------------------------------------------------------------------------- | --------- |
| 1   | Mock `teaches_class` diverges from production; RPC semantics unguarded     | 🟠 High   |
| 2   | No dark mode, sixteenth pass, while the app advertises a dark `themeColor` | 🟡 Medium |
| 3   | Production restore drill never performed                                   | 🟢 Low    |
| 4   | No documented position on pastoral-notes subject access                    | 🟢 Low    |

**Overall project health: 9.6 / 10** (…9.5 → 9.7 → 9.6). A marginal dip on one red gate; the
underlying security posture improved.

---

## 2. Project Overview (Phase 1)

### 2.1 Stack

| Concern           | Technology                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | Next.js 16.3, App Router, Turbopack build                                                                                                      |
| Language          | TypeScript 5, `strict: true`                                                                                                                   |
| UI                | React 19.2, Tailwind CSS v4, design-system tokens                                                                                              |
| Edge              | `src/proxy.ts` — host split, session refresh, auth gate, per-request CSP nonce, cookie-preserving redirects                                    |
| Database          | Supabase Postgres, RLS on every table, chain `0001`–`0082`, `pg_cron` retention + email drain                                                  |
| Auth              | Supabase Auth, allowlist-first, hardened cookies, **session TTL hardening**, mock-auth fails closed off Vercel                                 |
| Deployment safety | **`assertNoMockConfigInProduction`** — build and boot both refuse mock env vars under `VERCEL_ENV=production`                                  |
| File storage      | Custodial — academy-owned Google Drive (ADR-0006)                                                                                              |
| Privacy           | Privacy/terms pages, DPDP minimisation, consent records                                                                                        |
| Email             | Resend, queue-drained with atomic row claiming; **queue-health alarm on the keepalive cron**                                                   |
| Observability     | `logError` → stderr + Sentry, request-id correlated, PII stripped                                                                              |
| Testing           | Vitest (157 files, 1,179) + coverage ratchet + 2 parity tests + Playwright (69 specs) + RLS harness (**67 assertions**) + restore-drill script |
| CI                | `verify` + `e2e` + `rls`; executable pre-commit and pre-push hooks                                                                             |
| Hosting           | Vercel, region `bom1`                                                                                                                          |

### 2.2 The authorization split this window

`0079` narrowed **every** class-scoped write to tutor-only (`teaches_class_write`) to close a
mentor-write leak on class content. `0082` then repointed **only the two calendar write
policies** back to `teaches_class` (tutor _or_ mentor-of-an-enrolled-student), with the
reasoning recorded in the migration:

> Calendar is not content: repoint just the two CALENDAR write policies back to teaches_class …
> while announcements/resources/assignments/meet_links stay tutor-only on teaches_class_write.

That is a careful split — a mentor can coordinate mentoring sessions on a mentee's calendar
without gaining write access to teaching content. The app layer mirrors it with `canWriteClass`
(tutor-only) and the new `canWriteCalendar`, and `calendar-events.ts` / `timetable-slots.ts`
call the correct one at all seven call sites.

**Everything about this is right except the mock** (NEW-35).

### 2.3 Bundle profile

```
First-load shared JS (gzipped): 127.4 KB across 4 chunks
Budget (firstLoadSharedKb):     133 KB
```

Unchanged, within the budget ratcheted last pass.

---

## 3. Open Findings

---

### NEW-35 · The mock's `teaches_class` has no mentor branch — 🟠 High

```
api -- a mentor CAN create an event for a mentee class, but not a global one
  Expected: 201    Received: 403
```

Deterministic across both attempts.

**The application is correct.** The chain is verifiable end to end:

| Layer                         | State                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Real `teaches_class` (`0043`) | tutor **OR** mentor-of-an-enrolled-student                                         |
| `0082_mentor_calendar_write`  | repoints `calendar_events_write` / `timetable_slots_write` to `teaches_class`      |
| RLS harness                   | ✅ **67 assertions passing against real Postgres**                                 |
| `canWriteCalendar`            | `isAdmin → true`, else `teachesClass(classId)`                                     |
| Call sites                    | `calendar-events.ts` (×4) and `timetable-slots.ts` (×3) all use `canWriteCalendar` |
| E2E spec                      | correctly asserts 201 for a mentor                                                 |

**The mock is behind, and admits it** —
[src/lib/mock/client.ts:16-18](src/lib/mock/client.ts#L16-L18):

```ts
// teaches_class_write (0079) is the tutor-only WRITE scope; the mock's teaches_class
// is already a plain class_tutors lookup (no mentor branch), so both resolve the same
// tutor-of-class way here.
if (fn === 'teaches_class' || fn === 'teaches_class_write' || fn === 'is_enrolled') {
```

Both function names resolve to the same `class_tutors` lookup. In production they are two
different scopes; in mock they are one. A mentor therefore gets `false` from `teaches_class`,
`canWriteCalendar` returns false, and the route 403s.

**Why this is High rather than a spec nit.** The E2E suite runs against mock mode. Any
authorization path that depends on `teaches_class`'s mentor branch is being exercised against a
**different rule than production enforces** — so those specs are neither confirming nor
refuting the real behaviour. The RLS harness covers the database side, which is why the product
can be shown correct here; but the app-layer specs that pass on this path are passing for the
wrong reason.

**The guard-coverage gap this exposes.** Two parity guards were added over the last two passes,
and both stop short of this:

| Guard                               | Covers                                                 | Misses                        |
| ----------------------------------- | ------------------------------------------------------ | ----------------------------- |
| `mock-schema-parity.test.ts` (R14)  | every migration **table** has a mock counterpart       | ✔ tables only                 |
| `rls-coverage-parity.test.ts` (R15) | every RLS-enabled table is **asserted** in the harness | ✔ policies only               |
| —                                   | —                                                      | ❌ **RPC function semantics** |

This is the third distinct _kind_ of mock-parity failure in the series — missing table (R9,
`exchange_rates`), missing table (R13, `subjects`), now **divergent function behaviour**. The
first two are now guarded; this one is not.

**Recommendation:**

1. **Fix the mock** — give `teaches_class` the mentor branch (tutor-of-class **OR** mentor of a student enrolled in that class), keeping `teaches_class_write` as the tutor-only lookup. That restores the split `0079`/`0082` define and turns the spec green.
2. **Extend the guard to RPCs.** A parity test that every `create ... function` in the migration chain which the app calls via `.rpc(` has a mock branch would have caught this. It cannot verify _semantics_, but a divergence like two names collapsing into one implementation is worth an explicit acknowledgement in code rather than a comment.
3. **At minimum, make the comment a warning.** The current comment reads as a justification (_"so both resolve the same tutor-of-class way here"_); after `0082` it is a known divergence and should say so.

**Effort:** ~30 minutes for (1); ~1 hour for (2).

---

### Remaining carried findings

| ID                                                    | Finding                                                                                                                               | Severity  | Note                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FIND-29**                                           | No dark mode — `grep "dark:"` → **0** across sixteen passes, while `layout.tsx` declares a dark `themeColor`.                         | 🟡 Medium | Still the only Medium besides NEW-35. Build it on the token layer, or delete the one line.                                                                                                                                                                                                                                                                                  |
| **FIND-35**                                           | Restore drill **rehearsed 5/5**, production drill never performed.                                                                    | 🟢 Low    | [docs/operations.md](docs/operations.md) is now exemplary here: it states the mechanics are proven, that _"the production drill against a real backup has not yet been performed, and no production RTO is recorded here,"_ and carries a placeholder — _"Last production drill: **never performed** — record date + RTO here."_ Honest self-documentation of an open item. |
| **NEW-34**                                            | No written position on data-subject access to `mentee_notes`.                                                                         | 🟢 Low    |                                                                                                                                                                                                                                                                                                                                                                             |
| **FIND-32**                                           | No automated a11y check.                                                                                                              | 🟢 Low    |                                                                                                                                                                                                                                                                                                                                                                             |
| **NEW-06 / FIND-09 / FIND-10 / FIND-31 / FIND-44–46** | Matrix-persona batching; `src/features`; mock harness in the production graph; blog JSX; global search; footer mojibake; in-app help. | 🟢 Low    |                                                                                                                                                                                                                                                                                                                                                                             |

---

## 4. Security Audit (Phase 3)

**A strong defensive window.** Round-3 findings closed and referenced by ID.

| Control                                             | State                                                                                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dependency vulnerabilities**                      | ✅ **0**.                                                                                                                                                                    |
| **Database-layer authorization**                    | ✅ **67 assertions** (up from 64), parity-gated.                                                                                                                             |
| **Enforcement moved down a layer**                  | ✅ `b3d405d` puts the **submission deadline and Drive-link scheme at the DB boundary** — previously app-only. A constraint the Data API cannot bypass beats a service check. |
| **Content vs calendar write split**                 | ✅ `0079` + `0082` — mentors get calendar authority without content-write access, with the rationale in the migration.                                                       |
| **Messaging recipients re-filtered by live status** | ✅ `3c88285` — a recipient disabled between compose and send is now dropped.                                                                                                 |
| **Read-path PII + input hardening**                 | ✅ A-08, A-13, R-03; session read authz.                                                                                                                                     |
| **Session TTL + browser cookie adapter**            | ✅ R-02.                                                                                                                                                                     |
| **Mock config cannot reach production**             | ✅ `assertNoMockConfigInProduction` fails the build **and** boot.                                                                                                            |
| **Queue health**                                    | ✅ Alarm on the keepalive cron if queues back up or **RLS is disabled**.                                                                                                     |
| **App-layer authorization**                         | ⚠️ 68/69 — and see NEW-35 on what mock-mode specs can and cannot establish.                                                                                                  |

**No OWASP category carries a confirmed open defect.** A01 is verified at the database layer by
67 assertions; the app-layer verification has a known blind spot on the `teaches_class` mentor
branch until the mock is fixed.

---

## 5. Performance Audit (Phase 4)

Unchanged: first-load 127.4 KB against a 133 KB budget, email queued off the request path with
atomic claiming, org settings cached, dashboards batched, 304 on unchanged finance PDFs.

**Open:** the bounded matrix-persona loop (NEW-06).

---

## 6. Maintainability (Phase 5)

| Principle                                   | Assessment                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Enforcement at the lowest useful layer**  | ✅ Submission deadlines and Drive-link schemes moved from app checks to DB constraints.                         |
| **Deliberate, documented privilege splits** | ✅ `0082` explains why calendar is not content, in the migration itself.                                        |
| **Guard at the deployment boundary**        | ✅ Mock env vars refused under `VERCEL_ENV=production`, at build _and_ boot.                                    |
| **Honest documentation of open items**      | ✅ `operations.md` records "never performed" with a placeholder rather than implying the drill is done.         |
| **Mock fidelity**                           | ⚠️ The one area where a shortcut is documented as a justification rather than flagged as a divergence (NEW-35). |

### Module scorecard

| Module                                                                  |   R14   |   R15   |     R16     | Note                                                            |
| ----------------------------------------------------------------------- | :-----: | :-----: | :---------: | --------------------------------------------------------------- |
| `src/lib/capabilities` / `permission`                                   |   10    |   10    |   **10**    | `canWriteCalendar` mirrors the RLS split at all 7 call sites    |
| `src/lib/security` / `observability`                                    |   10    |   10    |   **10**    |                                                                 |
| `src/proxy.ts` / `attachments`                                          |   10    |   10    |   **10**    |                                                                 |
| `src/app/components` / `(prt)`                                          | 10 / 9  | 10 / 9  | **10 / 9**  |                                                                 |
| `src/lib/data` / `services` / `api` / `auth` / `session` / `validation` |   10    |   10    |   **10**    |                                                                 |
| `src/lib/ui`                                                            |    9    |    9    |    **9**    | −1: no dark-mode implementation on the token layer              |
| `supabase/migrations` / `rebuild`                                       | 10 / 10 | 10 / 10 | **10 / 10** | Chain `0082`, snapshot current                                  |
| `scripts/` + `.githooks/`                                               |   10    |   10    |   **10**    |                                                                 |
| `scripts/test-rls.sh`                                                   |    7    |   10    |   **10**    | 67 assertions                                                   |
| `src/lib/mock`                                                          |   10    |   10    |    **6**    | −4: `teaches_class` diverges from production (NEW-35)           |
| `tests/unit`                                                            |   10    |   10    |    **9**    | −1: parity guards stop at tables/policies, not RPCs             |
| `tests/e2e`                                                             |   10    |   10    |    **9**    | −1: one red spec, correctly asserting production behaviour      |
| `.github/` / `docs/`                                                    | 10 / 10 | 10 / 9  | **10 / 10** | `operations.md` restore-drill entry is a model of honest status |

---

## 7. Documentation (Phase 6)

Strong. This window added a deploy runbook and two more QA documents (security re-audit round 3
and a production-readiness audit), and the restore-drill entry in `operations.md` was rewritten
to state precisely what has and has not been done.

**One gap unchanged:** no written position on pastoral-notes subject access (NEW-34).

---

## 8. Debugging Experience (Phase 7)

Complete, and extended: the keepalive cron now emits a structured breach log if the email or
attachment queues back up **or RLS is disabled on any table** — monitoring that watches a
security control, not just a performance one.

---

## 9. Database Review (Phase 8)

**Schema:** chain `0001`–`0082`, RLS on every table, snapshot current, **67 harness assertions**
with a parity test preventing regression.

Two migrations stand out:

- **`0082_mentor_calendar_write`** — a narrow, reasoned repoint of exactly two policies, with the content/calendar distinction argued in the header.
- **`b3d405d`'s DB-boundary constraints** — submission deadline and Drive-link scheme enforced in Postgres, so the Data API cannot bypass what the app enforces.

---

## 10. Frontend Review (Phase 9)

No significant frontend change this window.

| ID          | Finding                       | Severity  |
| ----------- | ----------------------------- | --------- |
| **FIND-29** | No dark mode (sixteenth pass) | 🟡 Medium |
| **FIND-32** | No automated a11y check       | 🟢 Low    |

---

## 11. Backend Review (Phase 10)

Materially hardened: read-path PII scrubbing, input hardening, session read authorization,
session TTL, browser cookie adapter, consent-record honesty, self-update guard, messaging
recipient re-filtering by live profile status, and search escaping.

---

## 12. DevOps Review (Phase 11)

Three CI jobs, executable hooks, queue-health alarm, deploy runbook, and a production
deployment guard against mock configuration.

The insurance item carried from revision 13 remains: a CI assertion that hooks stay mode
`100755`, so a future squash cannot silently drop them the way one already did.

---

## 13. Testing Review (Phase 12)

| Type               | R14        | R15        | R16                                            |
| ------------------ | ---------- | ---------- | ---------------------------------------------- |
| Unit / integration | 150, 1,154 | 153, 1,161 | ✅ **157 files, 1,179**                        |
| Coverage           | 77.1%      | 76.96%     | ✅ **76.69% lines · 63.77% branches**          |
| E2E                | 69/69      | 69/69      | ❌ **68 passed / 1 failed**                    |
| RLS                | 34         | 64         | ✅ **67 passed**                               |
| Restore drill      | —          | scripted   | ✅ **rehearsed 5/5**, production drill pending |

**The failing spec is doing its job.** It was written to assert the behaviour `0082`
deliberately introduced, and it is failing because the harness it runs against has not caught
up. That is a better outcome than the spec being written to match the mock — which would have
locked the divergence in silently.

---

## 14. UX Review (Phase 13)

No user-facing change this window; it was defensive throughout.

| ID                | Finding                                           | Severity  |
| ----------------- | ------------------------------------------------- | --------- |
| **FIND-29**       | No dark mode (sixteenth pass)                     | 🟡 Medium |
| **FIND-44/45/46** | No global search; footer mojibake; no in-app help | 🟢 Low    |

---

## 15. Scalability Review (Phase 14)

| Dimension                            | Assessment                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Concurrency / horizontal scaling** | **Good.**                                                                                                                                         |
| **Request path**                     | **Good.**                                                                                                                                         |
| **Large database**                   | Growth tables bounded by retention; index inventories for `guardians`, `subjects`, `mentee_notes`, `attachments`, `entity_tags` still unexamined. |
| **Client payload**                   | ✅ 127.4 KB / 133 KB.                                                                                                                             |
| **Backup/restore**                   | ✅ Scripted and rehearsed; production drill pending.                                                                                              |

---

## 16. Complexity Analysis (Phase 15)

**Over-engineering:** none.

**Under-engineering — the recurring table:**

| Control                                   | R15         | R16                         |
| ----------------------------------------- | ----------- | --------------------------- |
| Snapshot / formatting / coverage / bundle | ✅          | ✅                          |
| Mock **table** parity                     | ✅          | ✅                          |
| RLS assertion parity                      | ✅          | ✅                          |
| **Mock RPC parity**                       | —           | ❌ **Unguarded — NEW-35**   |
| Production restore drill                  | ⚠️ Scripted | ⚠️ Rehearsed, not performed |

Every parity guard added so far has closed the _previous_ failure's shape. This is the next
shape.

---

## 17. Prioritised Action Plan (Phase 18)

### 🟠 High

**H1 · Give the mock's `teaches_class` its mentor branch** — NEW-35 · ~30 min · tutor-of-class
**or** mentor of an enrolled student, keeping `teaches_class_write` tutor-only. Turns the spec
green and stops mock-mode E2E enforcing a rule production does not.

**H2 · Extend parity to RPCs** — NEW-35 · ~1 h · a test that every migration function the app
calls via `.rpc(` has a distinct mock branch. It cannot verify semantics, but two scopes
collapsing into one implementation should require an explicit, reasoned exemption — the same
shrink-only pattern `rls-coverage-parity.test.ts` already uses.

### 🟡 Medium

**M1 · Close dark mode either way** — FIND-29 · sixteenth pass · implement on the token layer,
or delete the dark `themeColor`.

### 🟢 Low

| ID  | Action                                                                                        | Finding          |
| --- | --------------------------------------------------------------------------------------------- | ---------------- |
| L1  | Run the production restore drill; record date + RTO in the placeholder already waiting for it | FIND-35          |
| L2  | Write the pastoral-notes access position into the privacy documentation                       | NEW-34           |
| L3  | CI assertion that hooks stay mode `100755`                                                    | R13 carry        |
| L4  | `@axe-core/playwright` assertions                                                             | FIND-32          |
| L5  | Index review for `guardians`, `subjects`, `mentee_notes`, `attachments`, `entity_tags`        | §15              |
| L6  | Batch the matrix-persona reads                                                                | NEW-06           |
| L7  | Mark `src/features` PLANNED or remove it                                                      | FIND-09          |
| L8  | Blog content → MDX; footer mojibake; global search; in-app help                               | FIND-31/45/44/46 |

---

## 18. Quick Wins

1. **Mentor branch in the mock's `teaches_class`** — 30 min; turns the last red gate green. _(H1)_
2. **Rewrite the mock comment as a warning** — 2 min; it currently reads as a justification for a divergence that `0082` made real. _(H1)_
3. **Delete the dark `themeColor`** if dark mode isn't planned — 5 min; sixteen passes. _(M1)_
4. **CI hook-mode assertion** — 5 min. _(L3)_
5. **Run the restore drill** — half a day; the placeholder is already in `operations.md`. _(L1)_

---

## 19. Long-Term Improvements

1. **Mock fidelity as a first-class concern.** Three parity failures of three different shapes have now cost passes. Tables and policies are guarded; functions are next.
2. **Run the production restore drill.** Rehearsed 5/5; the real one has never been done.
3. **Dark mode or drop the claim.** Sixteen passes.
4. **Multi-tenancy readiness.** `org_settings` is still single-row by constraint while the data model keeps widening.

---

## 20. Overall Scorecard (Phase 16)

| Dimension                  |   R13   |   R14   |   R15   |   R16   | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | :-----: | :-----: | :-----: | :-----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**           |    9    |    9    |    9    |  **9**  | The content/calendar write split is a precise, well-argued privilege boundary. −1 for the unbuilt `src/features`.                                                                                                                                                                                                                                                                                                                                                          |
| **Security**               |    8    |   10    |   10    | **10**  | Round-3 findings closed by ID; enforcement pushed down to DB constraints; production refuses mock config; RLS assertions up to 67.                                                                                                                                                                                                                                                                                                                                         |
| **Maintainability**        |    9    |   10    |   10    |  **9**  | −1: the mock divergence is documented as a justification rather than flagged as a known gap.                                                                                                                                                                                                                                                                                                                                                                               |
| **Performance**            |   10    |   10    |   10    | **10**  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Scalability**            |    9    |    9    |    9    |  **9**  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Documentation**          |   10    |   10    |    9    | **10**  | The restore-drill entry states exactly what is and is not done, with a placeholder for the result.                                                                                                                                                                                                                                                                                                                                                                         |
| **Testing**                |    6    |    9    |   10    |  **9**  | −1: 1,179 unit + 67 RLS are excellent, but the E2E layer is running against a mock that enforces a different authorization rule on one path.                                                                                                                                                                                                                                                                                                                               |
| **Developer Experience**   |    7    |    9    |   10    |  **9**  | −1 for the red gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **User Experience**        |    9    |   10    |    9    |  **9**  | −1: dark mode, sixteenth pass.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Code Quality**           |    9    |    9    |   10    |  **9**  | Ten of eleven gates green, 0 warnings, 0 vulnerabilities.                                                                                                                                                                                                                                                                                                                                                                                                                  |
|                            |         |         |         |         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Overall Project Health** | **8.8** | **9.5** | **9.7** | **9.6** | A defensive window that closed the team's own round-3 findings and pushed two rules down into database constraints. The single red gate is the most useful kind of failure: a spec asserting the behaviour a migration deliberately introduced, failing because the mock has not caught up. Fixing the mock is thirty minutes; the more valuable follow-through is extending parity from tables and policies to the RPC functions where authorization is actually decided. |

---

## 21. Strengths

1. **Enforcement moved down a layer.** Submission deadlines and Drive-link schemes are now DB constraints, not just service checks — the Data API cannot bypass them.
2. **A precise privilege split, argued in the migration.** `0082` repoints exactly two calendar policies while content stays tutor-only, with the content/calendar distinction written down.
3. **Production refuses mock configuration** — `assertNoMockConfigInProduction` fails both build and boot, scoped so local E2E and previews still work.
4. **Monitoring that watches a security control** — the queue-health alarm also fires if RLS is disabled on any table.
5. **Messaging recipients re-filtered by live status**, closing the compose-then-disabled window.
6. **RLS assertions up to 67**, parity-gated so no RLS-enabled table can ship unasserted.
7. **The failing spec was written to production behaviour, not to the mock** — had it been written to match the mock, the divergence would have been locked in silently.
8. **`operations.md` records "never performed"** with a placeholder rather than implying the drill is done. Honest status beats optimistic status.
9. **Security findings originate in-house**, tracked by ID across three rounds, and referenced in the commits that fix them.
10. **Commits that name their findings**, sixteen passes running.

---

_Revision 16 performed 2026-08-26 against `feature/cert-ed-academia-app` @ `fa11762` with a
clean working tree, a clean `rm -rf .next` rebuild, and serial execution of every gate. Not
verified: whether the Sentry DSNs are configured in Vercel, whether the drain/reconcile crons
are wired on the production project, and whether the production restore drill has been run._
