# Cert-Ed Academia — Full Architecture & Codebase Audit

- **Date:** 2026-09-05 · **Revision 18** (living document; supersedes revisions 1–17. Filename reflects the first pass.)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `0f999c8` · working tree carries in-progress staging-test work
- **Method:** read-only static analysis + **serial** execution of `typecheck`, `format:check`, `lint`, `npm audit`, `test:coverage`, `test-rls.sh` (real Postgres 18, isolated DB), `build` (clean `.next`, `E2E_BUILD=1`), `check:bundle`, `check-snapshot-freshness`, `playwright test`
- **Scope:** Phases 1–19 of the audit brief

---

## 0. Revision 18 — six findings closed; five E2E failures traced to the test helper

Twenty-five commits: accessibility gating, MDX blog content, durable rate limiting, several
migrations through `0095`, finance generated from recorded hours, multi-session attendance, and
a staging Playwright project.

**Six carried findings closed**, including three that had been open for many passes. Two gates
are red, and both trace to causes outside the application code.

### Verification results

| Command                 | R15   | R16   | R17   | R18                                   |
| ----------------------- | ----- | ----- | ----- | ------------------------------------- |
| `npm run typecheck`     | ✅    | ✅    | ✅    | ✅                                    |
| `npm run lint`          | ✅    | ✅    | ✅    | ✅                                    |
| `npm run format:check`  | ✅    | ✅    | ✅    | ✅                                    |
| `npm test`              | 1,161 | 1,179 | 1,265 | ✅ **1,350 (170 files)**              |
| `npm run test:coverage` | ✅    | ✅    | ❌    | ✅ **77.23% lines · 64.03% branches** |
| `npm run build`         | ✅    | ✅    | ✅    | ✅ **0 warnings**                     |
| `npm run check:bundle`  | ✅    | ✅    | ✅    | ✅ **127.4 / 133 KB**                 |
| `npx playwright test`   | 69/69 | ❌ 1  | ❌ 3  | ❌ **5 failed / 74 passed**           |
| Snapshot freshness      | ✅    | ✅    | ✅    | ✅ **0095 current**                   |
| `scripts/test-rls.sh`   | 64    | 67    | 86    | ✅ **96 passed**                      |
| `npm audit --omit=dev`  | ✅ 0  | ✅ 0  | ✅ 0  | ❌ **1 high (build-time)**            |

### Findings closed this pass

| ID             | Finding                                                              | Evidence                                                                                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NEW-36** 🟠  | 320 px brand-logo overflow on every page — regression of QA-2026-004 | ✅ All four responsive specs pass. Closed in the E2E/UX defect-closure work (`8c44f9f`).                                                                                                                                                                                                                      |
| **NEW-37** 🟠  | Coverage ratchet breached (3rd occurrence)                           | ✅ **77.23% lines / 64.03% branches**, all four thresholds clear, with 85 new tests.                                                                                                                                                                                                                          |
| **NEW-38** 🟢  | `E2E_BUILD` undocumented                                             | ✅ `44b9ae0 chore(build): keep the mock stack out of the production bundle + **clearer local-build guard**`.                                                                                                                                                                                                  |
| **FIND-32** 🟢 | No automated a11y check — open since revision 9                      | ✅ `8274937 test(a11y): **axe-core gate on serious/critical WCAG 2 A/AA violations**`, plus `tests/e2e/a11y.pw.ts`, a baselined violation set (`7c40149`), AA-compliant text tokens (`4d18170`), a `secondary-ink` brand token with a **contrast gate** (`3a8814e`), and FullCalendar ARIA fixes (`7b07dd0`). |
| **NEW-06** 🟢  | Matrix-persona reads sequential — open since revision 3              | ✅ `3142f03 perf(messaging): resolve matrix persona members in **one union query**`.                                                                                                                                                                                                                          |
| **FIND-31** 🟢 | Blog content hard-coded as JSX                                       | ✅ Migrated to MDX — `src/content/blog/*.mdx` behind a `[slug]` route.                                                                                                                                                                                                                                        |
| **FIND-10** 🟢 | Mock harness in the production module graph                          | ✅ `44b9ae0` keeps the mock stack out of the production bundle.                                                                                                                                                                                                                                               |

Also closed since the last pass but worth noting: **RLS assertions 86 → 96**, durable rate
limiting and a health service (`46ecc45`), a **staging Playwright project** (`67c7ba7`), Node
pinned via `.nvmrc` (`d40f5b5`), and `0fe1517 refactor(data): assert writes actually matched a
row` — the `assertMutated` pattern extended across the data layer.

### New findings

| ID         | Finding                                                                                                                                                                                        | Severity  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **NEW-39** | `submitAndReload` reloads a page whose last navigation was a server-action POST, replaying it and creating the record twice. Five specs fail on strict-mode locators that match the duplicate. | 🟡 Medium |
| **NEW-40** | `npm audit --omit=dev` reports 1 high (`fast-uri` ≤3.1.5) via `@mdx-js/loader → webpack → schema-utils → ajv`. Build-time path; `fixAvailable: true`.                                          | 🟢 Low    |
| **NEW-41** | `scripts/test-rls.sh` hardcodes one database name; a concurrent process destroyed two runs this pass.                                                                                          | 🟢 Low    |

### Still open

| ID                                        | Finding                                                      | Severity  |
| ----------------------------------------- | ------------------------------------------------------------ | --------- |
| **FIND-29**                               | No dark mode — `grep "dark:"` → **0**, **eighteenth pass**   | 🟡 Medium |
| **NEW-35 follow-through**                 | No RPC-semantics parity guard                                | 🟡 Medium |
| **FIND-35**                               | Restore drill rehearsed; production drill never performed    | 🟢 Low    |
| **NEW-34**                                | No written position on data-subject access to pastoral notes | 🟢 Low    |
| **FIND-09 / FIND-44 / FIND-45 / FIND-46** | `src/features`; global search; footer mojibake; in-app help  | 🟢 Low    |

---

## 1. Executive Summary

Cert-Ed Academia is a Next.js 16 App Router monolith serving two hosts from one codebase: a
public marketing site (`certedacademia.com`) and a private academy portal
(`app.certedacademia.com`), on Supabase (Auth + Postgres with RLS) and Vercel.

This window cleared a long tail. Three findings that had survived nine or more passes —
no automated a11y check (revision 9), sequential matrix-persona reads (revision 3), and blog
content as hard-coded JSX (revision 8) — are all closed, and the accessibility work went
further than the recommendation: an axe-core gate on serious/critical WCAG A/AA violations, a
baselined starting set so the gate could be turned on immediately, AA-compliant text tokens,
and a **colour-contrast gate** on the brand palette.

Both red gates trace outside the application:

- **Five E2E failures** come from `submitAndReload` replaying a server-action POST on `page.reload()`, creating each record twice. The specs then fail on strict-mode locators. The product creates one record per click.
- **One dependency advisory** arrived with the MDX migration, in a build-time-only path, with a fix available.

| #   | Problem                                           | Severity  |
| --- | ------------------------------------------------- | --------- |
| 1   | `submitAndReload` duplicates records; 5 specs red | 🟡 Medium |
| 2   | No dark mode, eighteenth pass                     | 🟡 Medium |
| 3   | RPC-semantics parity still unguarded              | 🟡 Medium |
| 4   | `fast-uri` high advisory (build-time, fixable)    | 🟢 Low    |
| 5   | RLS harness cannot run concurrently               | 🟢 Low    |

**Overall project health: 9.4 / 10** (…9.6 → 9.3 → 9.4).

---

## 2. Project Overview (Phase 1)

### 2.1 Stack

| Concern       | Technology                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 16.3, App Router, webpack build + client-manifest check                                                                                                                                     |
| Language      | TypeScript 5, `strict: true`; **Node pinned via `.nvmrc`**                                                                                                                                          |
| UI            | React 19.2, Tailwind CSS v4, design tokens with an enforced **contrast gate**                                                                                                                       |
| Content       | **MDX** — `src/content/blog/*.mdx` behind a `[slug]` route                                                                                                                                          |
| Edge          | `src/proxy.ts` — host split, session refresh, auth gate, per-request CSP nonce, cookie-preserving redirects                                                                                         |
| Database      | Supabase Postgres, RLS on every table, chain `0001`–`0095`, `pg_cron` retention + email drain                                                                                                       |
| Rate limiting | **Durable** (`46ecc45`), with a health service                                                                                                                                                      |
| Privacy       | DPDP minimisation, guardian consent, note minimisation, erasure                                                                                                                                     |
| Testing       | Vitest (170 files, **1,350**) + coverage ratchet + 3 parity guards + Playwright (79 specs incl. **a11y**) + **staging Playwright project** + RLS harness (**96 assertions**) + restore-drill script |
| CI            | `verify` + `e2e` + `rls`, least-privilege permissions; executable hooks                                                                                                                             |
| Hosting       | Vercel, region `bom1`                                                                                                                                                                               |

### 2.2 What shipped

Finance now **generates receipts and pay slips from recorded hours** (`fd0e870`, `0095`), with
a follow-up making the function replacement re-runnable (`0f999c8`) — a good instinct, since a
non-idempotent `create or replace` is exactly what breaks a replayed migration chain.

Attendance gained **multiple sessions per day with per-session marking** (`439f306`, `0093`/`0094`),
an academy class-hours report for admin and sub-admin (`e9fb167`), and `0092` gave `sub_admin`
the class authority its capability baseline already promised — closing a gap between the
declared model and the enforced one.

### 2.3 Bundle profile

```
First-load shared JS (gzipped): 127.4 KB across 4 chunks
Budget (firstLoadSharedKb):     133 KB
```

Unchanged for twelve passes, now with the mock stack explicitly excluded from the production
bundle.

---

## 3. Open Findings

---

### NEW-39 · `submitAndReload` replays the POST and duplicates the record — 🟡 Medium

Five specs fail, all on content-creation journeys:

```
1) journeys.pw.ts  ADMIN -- create class -> announce -> issue receipt -> add user
2) journeys.pw.ts  TUTOR -- create assignment + comment on a student submission
3) personas.pw.ts  TUTOR -- shares a meet link, a resource, and comments on the resource
4) personas.pw.ts  TUTOR -- creates an assignment, grades homework + comments on it
5) personas.pw.ts  TUTOR -- marks attendance and adds a reminder
```

The first reports:

```
strict mode violation: getByRole('heading', { name: 'Welcome to Physics' })
  resolved to 2 elements
```

**Both matches are inside the same section.** The page snapshot shows
`heading "Announcements" [level=2]` followed by two `heading "Welcome to Physics" [level=3]`
nodes — so the announcement was created twice, not rendered twice.

**Mechanism.** `createAnnouncementAction` ends with `revalidatePath('/classroom', 'layout')`
and **no redirect**:

```ts
await createAnnouncementFromActionInput(me, {...})
} catch (error) { … }
revalidatePath('/classroom', 'layout')
```

The helper then reloads:

```ts
export async function submitAndReload(page: Page, click: () => Promise<void>) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST', …), click()])
  await page.waitForTimeout(300)
  await page.reload()          // ← replays the action POST
}
```

`page.reload()` on a page whose last navigation was the action POST re-issues it, so the record
is written a second time. Every failing spec uses `submitAndReload` for creation; the specs
that only read pass.

**The product is not duplicating on a single click** — a user clicking "Post" once gets one
announcement. **Not verified:** whether a real browser reload reproduces it; Chromium prompts
before resubmitting a document POST, and Next Server Actions are not classic document POSTs, so
real-user exposure is likely nil. That question is worth settling because it is the only part
of this with production relevance.

**Recommendation:**

1. **Fix the helper** — replace `page.reload()` with a fresh GET: `await page.goto(page.url())`. A GET cannot replay an action, and the helper's purpose (see the state after the write) is preserved. One line, removes an entire class of false failure across five specs.
2. Prefer `.first()` or a scoped locator in the specs regardless — strict-mode matches on list content are brittle.
3. **Consider POST/Redirect/GET for the create actions.** `revalidatePath` without `redirect` leaves the action result as the current navigation entry. Even if Server Actions make this safe today, redirecting after a successful create is the pattern that is safe by construction.

---

### NEW-40 · `fast-uri` high advisory via the MDX toolchain — 🟢 Low

```
fast-uri  3.0.0 - 3.1.5   high   fixAvailable: true
  host confusion via skipped IDN canonicalization on scheme-relative references
```

Path: `@mdx-js/loader → webpack → schema-utils → ajv → fast-uri@3.1.5`.

This is the first non-zero `npm audit` since revision 3, and it arrived with the MDX migration
that closed FIND-31 — a reasonable trade, not a regression in judgement.

**Scope is build-time.** `ajv` here validates _webpack loader configuration schemas_, not user
input, and `fast-uri` does not reach the server runtime or the client bundle. It surfaces under
`--omit=dev` only because `@mdx-js/loader` and `@next/mdx` sit in `dependencies` rather than
`devDependencies` — conventional for Next MDX setups, since `next.config.js` requires them at
build.

**Recommendation:** `npm audit fix` (a fix is available and the change is transitive), then
re-run the build. If it does not resolve cleanly, an `overrides` entry pinning `fast-uri` above
3.1.5 is the fallback. Low urgency given the path, but a clean audit is worth keeping — it has
been the project's baseline for fifteen passes.

---

### NEW-41 · The RLS harness cannot run concurrently — 🟢 Low

`scripts/test-rls.sh` hardcodes `DB=certed_rls_test` and drops it on start. Two runs this pass
died mid-chain:

```
MIGRATION FAILED: supabase/migrations/0045_document_management.sql
FATAL: database "certed_rls_test" does not exist — It seems to have just been dropped
```

A second database (`certed_gen_test`) exists alongside it, so another tool in this workspace is
touching the same names. Re-running against an isolated name gave a clean **96 passed, 0
failed**.

I flagged this as a theoretical wrinkle in revision 14. It has now bitten twice, and the CI job
is the place it would hurt: any future parallelism, or a second RLS-touching job, would produce
confusing mid-chain failures that look like migration errors.

**Recommendation:** derive the name — `DB="${RLS_TEST_DB:-certed_rls_test_$$}"` — so concurrent
runs are isolated by default while a fixed name stays available for debugging.

---

### Remaining carried findings

| ID                                        | Finding                                                                                                        | Severity  | Note                                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FIND-29**                               | No dark mode — `grep "dark:"` → **0** across eighteen passes, while `layout.tsx` declares a dark `themeColor`. | 🟡 Medium | The design-token layer now has an enforced contrast gate — the strongest foundation it has ever had for a themed implementation. Or delete the one line. |
| **NEW-35 follow-through**                 | No RPC-semantics parity guard.                                                                                 | 🟡 Medium | Three parity tests cover tables and policies. The revision-16 red gate was a **function** divergence; that class is still unguarded.                     |
| **FIND-35**                               | Restore drill rehearsed; production drill never performed.                                                     | 🟢 Low    |                                                                                                                                                          |
| **NEW-34**                                | No written position on data-subject access to pastoral notes.                                                  | 🟢 Low    |                                                                                                                                                          |
| **FIND-09 / FIND-44 / FIND-45 / FIND-46** | `src/features` never built; global search; footer mojibake; in-app help.                                       | 🟢 Low    |                                                                                                                                                          |

---

## 4. Security Audit (Phase 3)

| Control                                        | State                                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Database-layer authorization**               | ✅ **96 assertions** — up 10 this pass, three parity guards.                                                   |
| **`sub_admin` authority matches its baseline** | ✅ `0092` — closed a gap between the declared capability model and enforcement.                                |
| **Durable rate limiting**                      | ✅ `46ecc45` — no longer per-instance for the authenticated throttles either.                                  |
| **Write assertions**                           | ✅ `0fe1517` — the data layer now asserts writes matched a row, extending `assertMutated` coverage.            |
| **Idempotent migration replacement**           | ✅ `0f999c8` made the `0095` function replacement re-runnable.                                                 |
| **Mock excluded from the production bundle**   | ✅ `44b9ae0`, on top of the fail-closed env guard.                                                             |
| **Account email change**                       | ✅ `0f4af30` requires the current password.                                                                    |
| **Dependency vulnerabilities**                 | ⚠️ **1 high, build-time path, fix available** (NEW-40).                                                        |
| **App-layer authorization**                    | ✅ No authorization spec fails; the five red specs are content-creation journeys failing on duplicate records. |

**No OWASP category carries a confirmed open defect.**

---

## 5. Performance Audit (Phase 4)

**NEW-06 closed after fifteen passes** — matrix persona members now resolve in one union query
instead of up to five sequential reads (`3142f03`).

Also: `0091` indexes `class_sessions (class_id, actual_start)` for the teaching-hours path —
which answers the index question I raised in revision 17 about that aggregate. Route-level
loading skeletons were extended to slow admin pages (`f315751`).

First-load flat at 127.4 KB for a twelfth pass.

---

## 6. Maintainability (Phase 5)

| Principle                           | Assessment                                                                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Long-tail closure**               | ✅ Three findings open nine or more passes closed in one window.                                                                                                                                               |
| **Going beyond the recommendation** | The a11y work was asked for as "add `@axe-core/playwright`". What landed was a gate **plus** a baselined violation set so it could be enabled immediately, AA text tokens, and a contrast gate on the palette. |
| **Idempotency instinct**            | `0f999c8` fixing a `create or replace` to be re-runnable, unprompted, is the kind of thing that only shows up when someone thinks about replay.                                                                |
| **Declared vs enforced**            | `0092` closing the `sub_admin` gap is the right direction — the capability table was promising authority the guards did not grant.                                                                             |

### Module scorecard

| Module                                                                  |   R16   |   R17   |     R18     | Note                                                                          |
| ----------------------------------------------------------------------- | :-----: | :-----: | :---------: | ----------------------------------------------------------------------------- |
| `src/lib/capabilities` / `permission`                                   |   10    |   10    |   **10**    | `sub_admin` gap closed                                                        |
| `src/lib/security` / `observability`                                    |   10    |   10    |   **10**    | Durable rate limiting                                                         |
| `src/proxy.ts` / `attachments`                                          |   10    |   10    |   **10**    |                                                                               |
| `src/lib/mock`                                                          |    6    |   10    |   **10**    | Now excluded from the production bundle                                       |
| `src/app/(prt)`                                                         |    9    |    7    |   **10**    | +3: overflow regression closed, a11y tokens, skeletons                        |
| `src/lib/data` / `services` / `api` / `auth` / `session` / `validation` |   10    |   10    |   **10**    | Write assertions extended                                                     |
| `src/lib/ui`                                                            |    9    |    9    |   **10**    | Contrast gate on the token palette                                            |
| `supabase/migrations` / `rebuild`                                       | 10 / 10 | 10 / 10 | **10 / 10** | Chain `0095`, snapshot current                                                |
| `scripts/`                                                              |   10    |   10    |    **9**    | −1: RLS harness not concurrency-safe (NEW-41)                                 |
| `scripts/test-rls.sh`                                                   |   10    |   10    |   **10**    | 96 assertions                                                                 |
| `tests/unit`                                                            |    9    |    8    |    **9**    | 1,350 tests, ratchet clear; −1 still no RPC parity guard                      |
| `tests/e2e`                                                             |    9    |    9    |    **8**    | −2: the helper duplicates records (NEW-39); +a11y suite and a staging project |
| `.github/` / `docs/`                                                    | 10 / 9  | 10 / 9  | **10 / 10** |                                                                               |

---

## 7. Documentation (Phase 6)

`8c44f9f docs: refresh reference docs and record the E2E UX defect closure` keeps the pattern of
recording _why_ a defect closed, not just that it did. `docs/qa/` now holds the running series
of security rounds, production-readiness audits, and defect closures alongside this document.

---

## 8. Debugging Experience (Phase 7)

Complete, and extended with a **staging Playwright project** (`67c7ba7`) — the first test
surface that runs against a real deployment rather than the mock. That directly addresses the
class of problem behind NEW-35 and NEW-39: mock-only verification cannot see divergences from
production behaviour.

---

## 9. Database Review (Phase 8)

**Schema:** chain `0001`–`0095`, RLS on every table, snapshot current, **96 harness assertions**.

`0093`/`0094` (multiple sessions per day, per-session marking) is the structurally interesting
change this window — attendance was uniquely keyed `(class_id, student_id, session_date)`, one
mark per student per day, which a multi-session class breaks. The migration pair addresses it
rather than working around it.

---

## 10. Frontend Review (Phase 9)

The strongest accessibility window in the series: an axe-core gate on serious/critical WCAG 2
A/AA violations with a baselined starting set, AA-compliant muted-text tokens, a
`secondary-ink` token with a contrast gate, FullCalendar ARIA fixes, loading-skeleton roles,
prose link styling, denial-reason text, and a mobile-first calendar default.

| ID          | Finding                        | Severity  |
| ----------- | ------------------------------ | --------- |
| **FIND-29** | No dark mode (eighteenth pass) | 🟡 Medium |

---

## 11. Backend Review (Phase 10)

Finance generated from recorded hours, academy class-hours reporting, multi-session attendance,
durable rate limiting, a health service, write-assertion coverage across the data layer, and a
shared attachment view.

---

## 12. DevOps Review (Phase 11)

Three CI jobs with least-privilege permissions, executable hooks, a staging Playwright project,
and Node pinned via `.nvmrc`.

Carried insurance item: a CI assertion that hooks stay mode `100755`.

---

## 13. Testing Review (Phase 12)

| Type               | R16        | R17        | R18                                    |
| ------------------ | ---------- | ---------- | -------------------------------------- |
| Unit / integration | 157, 1,179 | 166, 1,265 | ✅ **170 files, 1,350**                |
| Coverage           | 76.69%     | ❌ 76.41%  | ✅ **77.23% lines**                    |
| E2E                | ❌ 1       | ❌ 3       | ❌ **5 failed / 74 passed** (79 specs) |
| a11y               | —          | —          | ✅ **axe-core gate, baselined**        |
| Staging            | —          | —          | ✅ **project added**                   |
| RLS                | 67         | 86         | ✅ **96 passed**                       |

The suite grew from 69 to 79 specs with the a11y additions. The five failures are all the same
helper defect, not five distinct problems — fixing `submitAndReload` should clear them
together.

---

## 14. UX Review (Phase 13)

Multi-session attendance with per-session marking, an academy class-hours report, finance
generated from recorded hours, shared status chips and pending affordances, and route-level
skeletons on slow admin pages.

| ID                | Finding                                     | Severity  |
| ----------------- | ------------------------------------------- | --------- |
| **FIND-29**       | No dark mode (eighteenth pass)              | 🟡 Medium |
| **FIND-44/45/46** | Global search; footer mojibake; in-app help | 🟢 Low    |

---

## 15. Scalability Review (Phase 14)

| Dimension          | Assessment                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Concurrency**    | **Good** — rate limiting now durable rather than per-instance.                                                                     |
| **Request path**   | **Good** — matrix persona resolution is one query; teaching-hours indexed (`0091`).                                                |
| **Large database** | Growth tables bounded by retention. Remaining index review: `guardians`, `subjects`, `mentee_notes`, `attachments`, `entity_tags`. |
| **Client payload** | ✅ 127.4 KB / 133 KB, twelve passes flat.                                                                                          |
| **Backup/restore** | Scripted and rehearsed; production drill pending.                                                                                  |

---

## 16. Complexity Analysis (Phase 15)

**Over-engineering:** none.

**Under-engineering:**

| Control                                          | R17 | R18                                |
| ------------------------------------------------ | --- | ---------------------------------- |
| Snapshot / formatting / bundle / lint / coverage | ✅  | ✅                                 |
| Table + policy parity                            | ✅  | ✅                                 |
| **Mock RPC parity**                              | ❌  | ❌ **Still unguarded**             |
| a11y gate                                        | ❌  | ✅ **axe-core, baselined**         |
| Staging verification                             | ❌  | ✅ **Playwright staging project**  |
| Production restore drill                         | ⚠️  | ⚠️ Rehearsed, not performed        |
| **E2E helper correctness**                       | —   | ❌ **Duplicates records (NEW-39)** |

---

## 17. Prioritised Action Plan (Phase 18)

### 🟡 Medium

**M1 · Fix `submitAndReload`** — NEW-39 · ~15 min · replace `page.reload()` with
`page.goto(page.url())`; re-run the suite; expect all five to clear together. Then settle
whether a real browser reload can duplicate a create, and adopt POST/Redirect/GET on the create
actions if so.

**M2 · Close dark mode either way** — FIND-29 · eighteenth pass · the contrast-gated token
layer is now the best foundation this has ever had; or delete the dark `themeColor`.

**M3 · Add an RPC-semantics parity guard** — NEW-35 follow-through · every migration function
the app calls via `.rpc(` needs a distinct mock branch or a written exemption.

### 🟢 Low

| ID  | Action                                                                                 | Finding       |
| --- | -------------------------------------------------------------------------------------- | ------------- |
| L1  | `npm audit fix`; re-run the build; fall back to an `overrides` pin if needed           | NEW-40        |
| L2  | Derive the RLS test database name so concurrent runs are isolated                      | NEW-41        |
| L3  | Run the production restore drill; fill the `operations.md` placeholder                 | FIND-35       |
| L4  | Write the pastoral-notes access position                                               | NEW-34        |
| L5  | CI assertion that hooks stay mode `100755`                                             | R13 carry     |
| L6  | Index review for `guardians`, `subjects`, `mentee_notes`, `attachments`, `entity_tags` | §15           |
| L7  | Mark `src/features` PLANNED or remove it                                               | FIND-09       |
| L8  | Global search; footer mojibake; in-app help                                            | FIND-44/45/46 |

---

## 18. Quick Wins

1. **One line in `submitAndReload`** — 15 min; clears five red specs. _(M1)_
2. **`npm audit fix`** — 5 min; restores a clean audit. _(L1)_
3. **Derive the RLS test DB name** — 5 min; stops a class of confusing mid-chain failures. _(L2)_
4. **Delete the dark `themeColor`** if dark mode isn't planned — 5 min; eighteen passes. _(M2)_
5. **CI hook-mode assertion** — 5 min. _(L5)_

---

## 19. Long-Term Improvements

1. **RPC parity.** Tables and policies are guarded three ways; the functions that decide authorization are guarded none.
2. **Lean on the staging project.** It is the first surface that can catch mock-vs-production divergence directly, which is the root of two of the last three red gates.
3. **Run the production restore drill.**
4. **Multi-tenancy readiness.** `org_settings` is still single-row by constraint while the model keeps widening.

---

## 20. Overall Scorecard (Phase 16)

| Dimension                  |   R15   |   R16   |   R17   |   R18   | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | :-----: | :-----: | :-----: | :-----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**           |    9    |    9    |    9    |  **9**  | Multi-session attendance addressed structurally rather than worked around. −1 for the unbuilt `src/features`.                                                                                                                                                                                                                                                                                                                                                           |
| **Security**               |   10    |   10    |   10    |  **9**  | 96 RLS assertions, durable rate limiting, `sub_admin` gap closed, write assertions extended. −1 for the open dependency advisory.                                                                                                                                                                                                                                                                                                                                       |
| **Maintainability**        |   10    |    9    |    9    | **10**  | Three long-carried findings closed; the a11y work exceeded its brief; an unprompted idempotency fix.                                                                                                                                                                                                                                                                                                                                                                    |
| **Performance**            |   10    |   10    |   10    | **10**  | NEW-06 closed; teaching-hours indexed; bundle flat.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Scalability**            |    9    |    9    |    9    |  **9**  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Documentation**          |   10    |    9    |    9    | **10**  | Defect closures recorded with reasoning; reference docs refreshed.                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Testing**                |   10    |    9    |    8    |  **9**  | 1,350 unit + 96 RLS + a11y gate + staging project. −1: the E2E helper writes twice.                                                                                                                                                                                                                                                                                                                                                                                     |
| **Developer Experience**   |   10    |    9    |    8    |  **9**  | −1: two red gates, both outside application code.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **User Experience**        |    9    |    9    |    8    | **10**  | Overflow regression closed, WCAG AA gating, contrast-gated tokens, skeletons. Dark mode is the lone gap and it is a decision, not a defect.                                                                                                                                                                                                                                                                                                                             |
| **Code Quality**           |   10    |    9    |    9    |  **9**  | Nine of eleven gates green, 0 warnings.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|                            |         |         |         |         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Overall Project Health** | **9.7** | **9.6** | **9.3** | **9.4** | A long-tail-clearing window: accessibility gated at WCAG AA with a contrast check on the palette, the fifteen-pass matrix-persona N+1 closed, blog content on MDX, the mock stack out of the production bundle, and RLS assertions at 96. Both red gates sit outside the application — a test helper that replays a POST, and a build-time dependency advisory that arrived with the MDX migration. Neither is a defect in shipped behaviour, and both are short fixes. |

---

## 21. Strengths

1. **Three findings open nine-plus passes closed together** — a11y gating, the matrix-persona N+1, and blog JSX.
2. **The a11y work exceeded its brief** — a gate, a baselined violation set so it could be switched on immediately, AA text tokens, and a **contrast gate** on the brand palette.
3. **A staging Playwright project** — the first verification surface that runs against a real deployment, addressing the exact blind spot behind two recent red gates.
4. **An unprompted idempotency fix** — `0f999c8` making a `create or replace` re-runnable, which only surfaces if someone thinks about migration replay.
5. **Declared model brought into line with enforcement** — `0092` gave `sub_admin` the authority its capability baseline already promised.
6. **Multi-session attendance solved structurally** — the `(class_id, student_id, session_date)` key was the real constraint, and it was changed rather than worked around.
7. **96 RLS assertions**, up 10, with three parity guards.
8. **Durable rate limiting and write assertions** extended across the data layer.
9. **Teaching-hours indexed** (`0091`), answering the aggregate-path question raised last pass.
10. **Commits that name their findings**, eighteen passes running.

---

_Revision 18 performed 2026-09-05 against `feature/cert-ed-academia-app` @ `0f999c8`. The
working tree carried in-progress staging-test work throughout, and changed during the pass;
those changes are not covered. The RLS harness was run against an isolated database after two
runs were destroyed by a concurrent process (NEW-41). Not verified: whether a real browser
reload reproduces NEW-39's duplicate, whether Sentry DSNs are configured in Vercel, and whether
the production restore drill has been run._
