# Cert-Ed Academia — Full Architecture & Codebase Audit

- **Date:** 2026-09-02 · **Revision 17** (living document; supersedes revisions 1–16. Filename reflects the first pass.)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `11f92f1` · **working tree clean**
- **Method:** read-only static analysis + **serial** execution of `typecheck`, `format:check`, `lint`, `npm audit`, `test:coverage`, `test-rls.sh` (real Postgres 18), `build` (clean `.next`), `check:bundle`, `check-snapshot-freshness`, `playwright test`
- **Scope:** Phases 1–19 of the audit brief

---

## 0. Revision 17 — NEW-35 closed well; a UX regression and the coverage ratchet break

Nine commits: eight migrations, guardian consent and erasure, teaching-hours reporting, mentor
session-time editing, assigned reminders, and round-4 security hardening.

**NEW-35 is closed exactly as recommended**, and RLS assertions jumped **67 → 86**. Two gates
are red: the coverage ratchet (third occurrence) and three responsive specs — the latter a
**regression of a defect first reported in the July 2026 QA audit and fixed in revision 12**.

### Verification results

| Command                 | R14   | R15   | R16   | R17                          |
| ----------------------- | ----- | ----- | ----- | ---------------------------- |
| `npm run typecheck`     | ✅    | ✅    | ✅    | ✅                           |
| `npm run lint`          | ❌    | ✅    | ✅    | ✅                           |
| `npm run format:check`  | ✅    | ✅    | ✅    | ✅                           |
| `npm test`              | 1,154 | 1,161 | 1,179 | ✅ **1,265 (166 files)**     |
| `npm run test:coverage` | ✅    | ✅    | ✅    | ❌ **2 thresholds breached** |
| `npm run build`         | ✅    | ✅    | ✅    | ✅ **0 warnings** (see note) |
| `npm run check:bundle`  | ✅    | ✅    | ✅    | ✅ **127.4 / 133 KB**        |
| `npx playwright test`   | 69/69 | 69/69 | ❌ 1  | ❌ **3 failed / 66 passed**  |
| Snapshot freshness      | ✅    | ✅    | ✅    | ✅ **0089 current**          |
| `scripts/test-rls.sh`   | 34    | 64    | 67    | ✅ **86 passed**             |
| `npm audit --omit=dev`  | ✅    | ✅    | ✅    | ✅ **0**                     |

> **Build note — not a finding.** My first `npm run build` failed with _"Mock-only env var(s)
> set in a production deployment: MOCK_MODE, NEXT_PUBLIC_MOCK_MODE."_ That is the new
> fail-closed guard (V-06) working correctly: `next build` sets `NODE_ENV=production`, and the
> repo's `.env.local` carries `MOCK_MODE=1`. The sanctioned path is `E2E_BUILD=1`, which
> `playwright.config.ts` sets — building that way succeeds. See NEW-38 for the one small gap
> this exposed.

### Findings closed this pass

| ID            | Finding                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NEW-35** 🟠 | Mock `teaches_class` had no mentor branch | ✅ **Closed exactly as recommended.** The mock now separates the scopes — `teaches_class_write` stays the tutor-only lookup, `teaches_class` gains the mentor branch (active mentorship **and** student-scoped persona **and** enrolment). The comment records the reasoning: _"Post-0082 the two scopes genuinely diverge … so the mock must too, or a mentor's calendar create/edit is wrongly refused (403) in mock mode while production allows it — the E2E suite runs on the mock."_ The mentor calendar spec passes. |
| **RLS depth** | 67 assertions                             | ✅ **86 passed**, and a third parity guard exists (`rls-required-parity.test.ts` alongside `mock-schema-parity` and `rls-coverage-parity`).                                                                                                                                                                                                                                                                                                                                                                                 |

### New findings

| ID         | Finding                                                                                                                                                             | Severity |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **NEW-36** | Horizontal overflow at 320 px on **every page** for tutor, mentor and student — the portal brand logo. A regression of QA-2026-004 / FIND-30, fixed in revision 12. | 🟠 High  |
| **NEW-37** | Coverage ratchet breached — **third occurrence** (functions 71.63/72, statements 72.83/73)                                                                          | 🟠 High  |
| **NEW-38** | `E2E_BUILD=1` is the only sanctioned local build path with `.env.local` present, and it is documented nowhere outside `playwright.config.ts`                        | 🟢 Low   |

### Still open

| ID                                                              | Finding                                                                                                                                          | Severity  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| **FIND-29**                                                     | No dark mode — `grep "dark:"` → **0**, **seventeenth pass**                                                                                      | 🟡 Medium |
| **NEW-35 follow-through**                                       | No RPC-semantics parity guard; three parity tests cover tables and policies only                                                                 | 🟡 Medium |
| **FIND-35**                                                     | Restore drill rehearsed 5/5; production drill never performed                                                                                    | 🟢 Low    |
| **NEW-34**                                                      | No written position on data-subject access to pastoral notes                                                                                     | 🟢 Low    |
| **FIND-32 / NEW-06 / FIND-09 / FIND-10 / FIND-31 / FIND-44–46** | a11y check; matrix-persona batching; `src/features`; mock harness in the production graph; blog JSX; global search; footer mojibake; in-app help | 🟢 Low    |

---

## 1. Executive Summary

Cert-Ed Academia is a Next.js 16 App Router monolith serving two hosts from one codebase: a
public marketing site (`certedacademia.com`) and a private academy portal
(`app.certedacademia.com`), on Supabase (Auth + Postgres with RLS) and Vercel.

A substantial window: eight migrations, guardian consent with note minimisation and erasure,
monthly per-tutor teaching hours with class isolation, mentor session-time editing, assigned
reminders, and round-4 security hardening (A-04, A-09, A-10, N-10). RLS assertions rose from 67
to **86** — the deepest database-layer verification in the series.

Two gates are red, and the more interesting one is a **regression**. Three responsive specs
fail because the portal brand logo overflows the viewport by 8 px on every page at 320 px. That
is the same element, the same delta, and the same signature as **QA-2026-004** in the original
July 2026 QA audit — reported there as _"offender points to top brand link/image container"_,
carried through four audit passes as FIND-30, and closed in revision 12. It has come back.

| #   | Problem                                                               | Severity  |
| --- | --------------------------------------------------------------------- | --------- |
| 1   | 320 px overflow on every page for three of four personas — regression | 🟠 High   |
| 2   | Coverage ratchet breached, third occurrence                           | 🟠 High   |
| 3   | No dark mode, seventeenth pass                                        | 🟡 Medium |
| 4   | RPC-semantics parity still unguarded                                  | 🟡 Medium |
| 5   | `E2E_BUILD` undocumented                                              | 🟢 Low    |

**Overall project health: 9.3 / 10** (…9.7 → 9.6 → 9.3). The security and database work is
excellent; the dip is two red gates, one of which is a defect this project has already fixed
once.

---

## 2. Project Overview (Phase 1)

### 2.1 Stack

| Concern           | Technology                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | Next.js 16.3, App Router, **webpack build** (`next build --webpack`) + a client-manifest check                                                          |
| Language          | TypeScript 5, `strict: true`                                                                                                                            |
| UI                | React 19.2, Tailwind CSS v4, design-system tokens                                                                                                       |
| Edge              | `src/proxy.ts` — host split, session refresh, auth gate, per-request CSP nonce, cookie-preserving redirects                                             |
| Database          | Supabase Postgres, RLS on every table, chain `0001`–`0089`, `pg_cron` retention + email drain                                                           |
| Auth              | Supabase Auth, allowlist-first, hardened cookies, session TTL                                                                                           |
| Deployment safety | `assertNoMockConfigInProduction` at build **and** boot, fail-closed (V-06)                                                                              |
| Privacy           | Privacy/terms, DPDP minimisation, **guardian consent, note minimisation, erasure**                                                                      |
| Testing           | Vitest (166 files, **1,265**) + coverage ratchet + **3 parity guards** + Playwright (69 specs) + RLS harness (**86 assertions**) + restore-drill script |
| CI                | `verify` + `e2e` + `rls`; executable hooks; **least-privilege CI**                                                                                      |
| Hosting           | Vercel, region `bom1`                                                                                                                                   |

### 2.2 What shipped

| Commit    | Work                                                                |
| --------- | ------------------------------------------------------------------- |
| `520211f` | Migrations `0082`–`0089`, regenerated snapshot, RLS/privilege gates |
| `ac35771` | **Monthly per-tutor teaching hours with class isolation**           |
| `10df116` | Mentor session-time editing with full validation                    |
| `47e4980` | **Guardian consent, note minimisation, erasure & consent read**     |
| `2a454d2` | Auth & authorization hardening — A-04, A-09, A-10, N-10             |
| `47e9c8d` | Assigned reminders — student mark-done only                         |
| `30d008c` | Link-scheme guard, mock-var lists, CSP & **least-privilege CI**     |
| `03b3ad7` | Queue-health RLS list; messaging/notifications/history refinements  |

`47e4980` is the notable one for compliance posture: guardian consent, **note minimisation**
and **erasure** are the three DPDP obligations that were still unaddressed after the
minimisation work in revision 14. Erasure in particular is the hardest to retrofit, and it
landed alongside the consent read path rather than after it.

### 2.3 Bundle profile

```
First-load shared JS (gzipped): 127.4 KB across 4 chunks
Budget (firstLoadSharedKb):     133 KB
```

Unchanged for eleven passes.

---

## 3. Open Findings

---

### NEW-36 · The portal brand logo overflows at 320 px — regression — 🟠 High

Three specs fail deterministically (tutor, mentor, student; admin passes):

```
tutor: pages that scroll sideways
  "/dashboard @ 320px  -> +8px  [a.flex.shrink-0.items-center (right=328, w=320)
                                 |  img.w-auto.object-contain (right=328, w=320)]"
  … and 8 more: /classroom, /classroom/{id}, …/classwork, …/attendance, …/people,
    /calendar, /settings, /assignments/{id}
```

Every page, same offender, same +8 px.

**Cause.** [src/app/(prt)/PortalHeader.tsx:27-40](<src/app/(prt)/PortalHeader.tsx#L27-L40>):

```tsx
<Link href="/dashboard" className="flex shrink-0 items-center">
  <Image
    src="/cert-ed-academia-online-tuition-logo.webp"
    width={320}
    height={80}
    className="w-auto object-contain"
    style={{ height: 'clamp(2.25rem, 4.5vw, 3.75rem)' }}
```

`w-auto` on an image whose intrinsic width is **320 px** renders it 320 px wide; `shrink-0` on
the parent link stops the flex row shrinking it; the header's horizontal padding then pushes it
to `right=328` in a 320 px viewport. Exactly +8 px.

**This is a regression, not a new defect.** The original **QA-2026-004** (2026-07-30 QA audit)
described _"repeated `+8px` overflow, offender points to top brand link/image container."_ It
was carried as FIND-30 through revisions 8–11, closed in revision 12 when the responsive sweep
went green, and held green in revisions 13–16. The brand block was last touched by `a617665
refactor(ui): migrate portal components to shared form/design-system primitives` — the same
commit window that introduced the design tokens.

**Not verified:** why admin passes. Its header renders the same component, so the likely
explanation is a sibling element forcing a wrap; worth confirming rather than assuming the
admin path is safe.

**Recommendation — one class:**

```tsx
className = 'w-auto max-w-full object-contain'
```

`max-w-full` caps the image at its container regardless of intrinsic width, and the clamped
height keeps the aspect ratio. Alternatively drop `shrink-0` from the link and add `min-w-0`,
but `max-w-full` is the smaller change and matches what `object-contain` already implies.

Then re-run `responsive.pw.ts`, and consider why a spec suite that covers this exact case did
not catch it between revision 12 and now — the responsive specs were green in R13–R16, so the
regression arrived with a UI change that the suite did run against. **Not verified** which pass
it entered; a bisect over `PortalHeader.tsx` would settle it.

---

### NEW-37 · Coverage ratchet breached — third occurrence — 🟠 High

```
ERROR: Coverage for functions (71.63%) does not meet global threshold (72%)
ERROR: Coverage for statements (72.83%) does not meet global threshold (73%)
```

1,265 tests pass — 86 more than last pass — but the feature window added more uncovered code
than covered.

**The context matters and is mostly good news.** The floor is far higher than when this last
happened: lines are at 76.41% against a 72% threshold in revision 13. What broke are the two
metrics whose thresholds were raised after revision 14's push — functions to 72 and statements
to 73 — and both are now under by less than half a point.

But the pattern is now three-for-three: coverage erodes during every large feature window
(R8, R13, R17) and is repaired afterwards. Revision 13 recommended a one-time push for
headroom; revision 14 delivered it; that headroom has been consumed in three passes.

**Recommendation:** add tests for this window's largest uncovered additions — teaching-hours
reporting, guardian consent/erasure, mentor session-time editing and assigned reminders are the
candidates (`npx vitest run --coverage` prints per-file numbers). **Do not lower the
thresholds.** If the erode-repair cycle is to stop, the more durable option is to require
coverage on _changed files_ in CI rather than only a global floor — a global percentage will
always drift when a window adds more surface than tests.

---

### NEW-38 · The sanctioned local build path is undocumented — 🟢 Low

`grep -rn "E2E_BUILD" docs/ playwright.config.ts` returns exactly one hit —
`playwright.config.ts:36`. Nothing in `docs/mock-mode.md`, `docs/setup-guide.md` or
`README.md` mentions it.

The guard is correct and deliberately fail-closed. But with `.env.local` present (the documented
local setup, carrying `MOCK_MODE=1`), a plain `npm run build` now fails with a message that
tells the developer to _"Remove them from the Production environment"_ — which is the right
advice for a real production deploy and the wrong advice locally.

**Recommendation:** one line in `docs/mock-mode.md` — _"To build locally with mock mode on, use
`E2E_BUILD=1 npm run build`; a plain production build refuses mock env vars by design (V-06)."_
Optionally, detect the local case in the error message and suggest `E2E_BUILD=1` rather than
env removal.

---

### Remaining carried findings

| ID                                                              | Finding                                                                                                                                           | Severity  | Note                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NEW-35 follow-through**                                       | No RPC-semantics parity guard.                                                                                                                    | 🟡 Medium | Three parity tests now exist (`mock-schema-parity`, `rls-coverage-parity`, `rls-required-parity`) — all cover tables and policies. The divergence that cost revision 16 a red gate was a **function**, and that class is still unguarded. |
| **FIND-29**                                                     | No dark mode — `grep "dark:"` → **0**, seventeenth pass, while `layout.tsx` declares a dark `themeColor`.                                         | 🟡 Medium |                                                                                                                                                                                                                                           |
| **FIND-35**                                                     | Restore drill rehearsed 5/5; production drill never performed.                                                                                    | 🟢 Low    | `operations.md` still carries the _"Last production drill: **never performed**"_ placeholder.                                                                                                                                             |
| **NEW-34**                                                      | No written position on data-subject access to pastoral notes.                                                                                     | 🟢 Low    | More pressing now that erasure and consent read exist (`47e4980`) — the access side is the remaining gap in the same obligation set.                                                                                                      |
| **FIND-32 / NEW-06 / FIND-09 / FIND-10 / FIND-31 / FIND-44–46** | a11y check; matrix-persona batching; `src/features`; mock harness in the production graph; blog JSX; global search; footer mojibake; in-app help. | 🟢 Low    |                                                                                                                                                                                                                                           |

---

## 4. Security Audit (Phase 3)

| Control                                          | State                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Dependency vulnerabilities**                   | ✅ **0**.                                                                        |
| **Database-layer authorization**                 | ✅ **86 assertions** — up 19 this pass, the deepest in the series.               |
| **Round-4 hardening**                            | ✅ A-04, A-09, A-10, N-10 closed by ID.                                          |
| **Link-scheme guard**                            | ✅ `30d008c`.                                                                    |
| **Least-privilege CI**                           | ✅ `30d008c` — CI permissions narrowed.                                          |
| **Mock config cannot reach production**          | ✅ Fail-closed at build and boot; the guard demonstrably fires (I triggered it). |
| **Guardian consent, note minimisation, erasure** | ✅ `47e4980` — the three DPDP obligations still outstanding after revision 14.   |
| **Queue-health RLS list**                        | ✅ `03b3ad7` — the alarm's disabled-RLS check now has an explicit table list.    |
| **App-layer authorization**                      | ✅ 66/69 E2E; all three failures are responsive layout, not authorization.       |

**No OWASP category carries a confirmed open defect.**

---

## 5. Performance Audit (Phase 4)

First-load unchanged at 127.4 KB against a 133 KB budget, eleven passes flat.

New this window: **monthly per-tutor teaching hours with class isolation** (`ac35771`) — an
aggregate reporting path worth watching as data grows, since per-tutor monthly rollups over
`class_sessions` are the shape that turns into a slow query first. **Not verified** whether it
is indexed for that access pattern; worth adding to the index review already on the list.

---

## 6. Maintainability (Phase 5)

| Principle                                  | Assessment                                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mock fidelity fixed at the root**        | ✅ NEW-35 closed by separating the two scopes _and_ writing down why they diverge, so the next person cannot re-collapse them by accident.                                                                |
| **Compliance obligations landed together** | Consent, minimisation and erasure in one commit rather than erasure deferred — the hardest of the three is usually the one left behind.                                                                   |
| **Fail-closed guards**                     | The mock-var guard refuses anything not positively sanctioned, and documents the three sanctioned contexts inline.                                                                                        |
| **Regression discipline**                  | ⚠️ The weak point this pass. A UX defect fixed in revision 12 has returned, and the suite that covers it was green in the four intervening passes — so it re-entered with a change the suite ran against. |

### Module scorecard

| Module                                                                  |   R15   |   R16   |     R17     | Note                                                            |
| ----------------------------------------------------------------------- | :-----: | :-----: | :---------: | --------------------------------------------------------------- |
| `src/lib/capabilities` / `permission`                                   |   10    |   10    |   **10**    |                                                                 |
| `src/lib/security` / `observability`                                    |   10    |   10    |   **10**    |                                                                 |
| `src/proxy.ts` / `attachments`                                          |   10    |   10    |   **10**    |                                                                 |
| `src/lib/mock`                                                          |   10    |    6    |   **10**    | +4: NEW-35 fixed with the divergence documented                 |
| `src/app/(prt)`                                                         |    9    |    9    |    **7**    | −2: the header regression affects every page for three personas |
| `src/lib/data` / `services` / `api` / `auth` / `session` / `validation` |   10    |   10    |   **10**    | Consent, erasure, teaching hours                                |
| `src/lib/ui`                                                            |    9    |    9    |    **9**    |                                                                 |
| `supabase/migrations` / `rebuild`                                       | 10 / 10 | 10 / 10 | **10 / 10** | Chain `0089`, snapshot current                                  |
| `scripts/` + `.githooks/`                                               |   10    |   10    |   **10**    |                                                                 |
| `scripts/test-rls.sh`                                                   |   10    |   10    |   **10**    | 86 assertions                                                   |
| `tests/unit`                                                            |   10    |    9    |    **8**    | −2: ratchet breached; still no RPC parity guard                 |
| `tests/e2e`                                                             |   10    |    9    |    **9**    | Caught the regression — working as intended                     |
| `.github/`                                                              |   10    |   10    |   **10**    | Least-privilege permissions                                     |
| `docs/`                                                                 |   10    |   10    |    **9**    | −1: `E2E_BUILD` undocumented (NEW-38)                           |

---

## 7. Documentation (Phase 6)

`11f92f1` added three more QA documents — security round 4, production-readiness r15, and a
feature audit. The documentation set continues to be self-directed and current.

**Two gaps:** `E2E_BUILD` (NEW-38), and the pastoral-notes access position (NEW-34), which is
now the odd one out in an otherwise complete DPDP obligation set.

---

## 8. Debugging Experience (Phase 7)

Complete. The queue-health alarm now carries an explicit RLS table list, so the
disabled-RLS check cannot silently miss a new table.

---

## 9. Database Review (Phase 8)

**Schema:** chain `0001`–`0089`, RLS on every table, snapshot current, **86 harness
assertions** with three parity guards.

Eight migrations this window plus RLS/privilege gates. The assertion count rising 19 in one
pass, alongside consent and erasure tables, is the right correlation — new sensitive data
arriving with new assertions rather than after them.

---

## 10. Frontend Review (Phase 9)

| ID          | Finding                                                            | Severity  |
| ----------- | ------------------------------------------------------------------ | --------- |
| **NEW-36**  | Brand logo overflows 320 px on every page for tutor/mentor/student | 🟠 High   |
| **FIND-29** | No dark mode (seventeenth pass)                                    | 🟡 Medium |
| **FIND-32** | No automated a11y check                                            | 🟢 Low    |

---

## 11. Backend Review (Phase 10)

Teaching-hours reporting with class isolation, mentor session-time editing with full validation,
assigned reminders with a student-only mark-done path, guardian consent and erasure, and
round-4 auth/authorization hardening. All fit the existing service/data layering.

---

## 12. DevOps Review (Phase 11)

Three CI jobs with **least-privilege permissions** now (`30d008c`), executable hooks,
queue-health alarm, deploy runbook, and a fail-closed production guard against mock config.

The insurance item carried from revision 13 remains: a CI assertion that hooks stay mode
`100755`.

---

## 13. Testing Review (Phase 12)

| Type               | R15        | R16        | R17                                                  |
| ------------------ | ---------- | ---------- | ---------------------------------------------------- |
| Unit / integration | 153, 1,161 | 157, 1,179 | ✅ **166 files, 1,265**                              |
| Coverage           | 76.96%     | 76.69%     | ❌ **76.41% lines; functions + statements breached** |
| E2E                | 69/69      | ❌ 1       | ❌ **3 failed / 66 passed**                          |
| RLS                | 64         | 67         | ✅ **86 passed**                                     |

**The E2E suite caught the regression**, which is the system working. What is worth
investigating is _when_ it entered: the responsive specs were green in revisions 13–16, so the
change that reintroduced the overflow was made while the suite was running and passing. Either
the regression is very recent (this window) or the spec's viewport/setup changed. A bisect over
`PortalHeader.tsx` between R16 and now would answer it in minutes.

---

## 14. UX Review (Phase 13)

Guardian consent and erasure, assigned reminders with student mark-done, mentor session-time
editing, monthly teaching hours.

Offset by NEW-36: three of four personas currently get a sideways-scrolling portal on a 320 px
device, on every page.

---

## 15. Scalability Review (Phase 14)

| Dimension                            | Assessment                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Concurrency / horizontal scaling** | **Good.**                                                                                                                                                                                 |
| **Request path**                     | **Good.**                                                                                                                                                                                 |
| **Large database**                   | Growth tables bounded by retention. Index inventories for `guardians`, `subjects`, `mentee_notes`, `attachments`, `entity_tags` **and now the teaching-hours aggregate path** unexamined. |
| **Client payload**                   | ✅ 127.4 KB / 133 KB.                                                                                                                                                                     |
| **Backup/restore**                   | ✅ Scripted and rehearsed; production drill pending.                                                                                                                                      |

---

## 16. Complexity Analysis (Phase 15)

**Over-engineering:** none.

**Under-engineering:**

| Control                               | R16 | R17                             |
| ------------------------------------- | --- | ------------------------------- |
| Snapshot / formatting / bundle / lint | ✅  | ✅                              |
| Mock **table** parity                 | ✅  | ✅                              |
| RLS assertion parity                  | ✅  | ✅ (86 assertions, 3 guards)    |
| **Mock RPC parity**                   | ❌  | ❌ **Still unguarded**          |
| **Coverage durability**               | ✅  | ❌ **Eroded again — 3rd cycle** |
| Production restore drill              | ⚠️  | ⚠️ Rehearsed, not performed     |

---

## 17. Prioritised Action Plan (Phase 18)

### 🟠 High

**H1 · Fix the brand-logo overflow** — NEW-36 · ~10 min · add `max-w-full` to the logo's
`className`; re-run `responsive.pw.ts`; bisect `PortalHeader.tsx` to learn which change
reintroduced it, since the suite was green through four passes.

**H2 · Restore coverage above the ratchet** — NEW-37 · ~3 h · tests for teaching hours,
guardian consent/erasure, mentor session-time editing and assigned reminders. Consider a
changed-files coverage requirement so the global floor stops eroding each window.

### 🟡 Medium

| ID  | Action                                                                                                                                     | Finding               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| M1  | Add an RPC-semantics parity guard — every migration function the app calls via `.rpc(` needs a distinct mock branch or a written exemption | NEW-35 follow-through |
| M2  | Close dark mode either way — implement on the token layer, or delete the dark `themeColor` (seventeenth pass)                              | FIND-29               |
| M3  | Index review, now including the monthly teaching-hours aggregate path                                                                      | §15                   |

### 🟢 Low

| ID  | Action                                                                                                  | Finding          |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------- |
| L1  | Document `E2E_BUILD=1` in `docs/mock-mode.md`; consider detecting the local case in the guard's message | NEW-38           |
| L2  | Run the production restore drill; fill the placeholder already waiting in `operations.md`               | FIND-35          |
| L3  | Write the pastoral-notes access position — the last gap in an otherwise complete DPDP set               | NEW-34           |
| L4  | CI assertion that hooks stay mode `100755`                                                              | R13 carry        |
| L5  | `@axe-core/playwright` assertions                                                                       | FIND-32          |
| L6  | Batch the matrix-persona reads                                                                          | NEW-06           |
| L7  | Mark `src/features` PLANNED or remove it                                                                | FIND-09          |
| L8  | Blog content → MDX; footer mojibake; global search; in-app help                                         | FIND-31/45/44/46 |

---

## 18. Quick Wins

1. **`max-w-full` on the portal logo** — 10 min; turns three red specs green and closes a regression. _(H1)_
2. **One line documenting `E2E_BUILD=1`** — 2 min; the guard is right, the local guidance is missing. _(L1)_
3. **Delete the dark `themeColor`** if dark mode isn't planned — 5 min; seventeen passes. _(M2)_
4. **CI hook-mode assertion** — 5 min. _(L4)_
5. **Pastoral-notes access paragraph** — 30 min; completes the DPDP set now that consent and erasure exist. _(L3)_

---

## 19. Long-Term Improvements

1. **Coverage durability.** Three erode-repair cycles suggests a global floor is the wrong instrument; per-change coverage would hold without the periodic scramble.
2. **RPC parity.** Tables and policies are guarded three ways; the functions where authorization is actually decided are guarded none.
3. **Run the production restore drill.** Rehearsed 5/5; never done for real.
4. **Multi-tenancy readiness.** `org_settings` is still single-row by constraint while consent, guardians, subjects and teaching-hours reporting all widen the model.

---

## 20. Overall Scorecard (Phase 16)

| Dimension                  |   R14   |   R15   |   R16   |   R17   | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | :-----: | :-----: | :-----: | :-----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**           |    9    |    9    |    9    |  **9**  | Consent, erasure and teaching-hours reporting fit the layering cleanly. −1 for the unbuilt `src/features`.                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Security**               |   10    |   10    |   10    | **10**  | Round-4 findings closed by ID; 86 RLS assertions; least-privilege CI; a fail-closed production guard that demonstrably fires.                                                                                                                                                                                                                                                                                                                                                                                    |
| **Maintainability**        |   10    |   10    |    9    |  **9**  | NEW-35 fixed at the root with the divergence documented. −1: a revision-12 UX fix regressed.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Performance**            |   10    |   10    |   10    | **10**  | Bundle flat eleven passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Scalability**            |    9    |    9    |    9    |  **9**  | Teaching-hours aggregate path unindexed-unknown.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Documentation**          |   10    |   10    |   10    |  **9**  | −1 for the undocumented `E2E_BUILD` path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Testing**                |   10    |   10    |    9    |  **8**  | 1,265 unit + 86 RLS is excellent depth. −2 for the breached ratchet and the still-unguarded RPC parity.                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Developer Experience**   |   10    |   10    |    9    |  **8**  | −2: two red gates, and a plain local `npm run build` now fails with advice aimed at a production deploy.                                                                                                                                                                                                                                                                                                                                                                                                         |
| **User Experience**        |   10    |    9    |    9    |  **8**  | −2: three of four personas get a sideways-scrolling portal at 320 px, on every page.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Code Quality**           |   10    |   10    |    9    |  **9**  | Nine of eleven gates green, 0 warnings, 0 vulnerabilities.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|                            |         |         |         |         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Overall Project Health** | **9.5** | **9.7** | **9.6** | **9.3** | The database and security work is the strongest it has been — 86 RLS assertions, round-4 findings closed by ID, and the three outstanding DPDP obligations landed together. NEW-35 was closed exactly as recommended, with the reasoning written where it prevents a repeat. The dip is two red gates: a coverage ratchet on its third erode cycle, and a 320 px overflow that this project already found, fixed, and has now reintroduced. Both are small fixes; the regression is the one worth a post-mortem. |

---

## 21. Strengths

1. **NEW-35 closed at the root** — the two scopes separated in the mock _and_ the divergence explained, so it cannot be silently re-collapsed.
2. **86 RLS assertions**, up 19 in one pass, arriving alongside the sensitive tables they cover rather than after them.
3. **Consent, note minimisation and erasure shipped together** — erasure is the obligation usually deferred, and it was not.
4. **A fail-closed production guard that actually fires.** I triggered it by accident; it refused the build and explained why.
5. **Least-privilege CI** — permissions narrowed rather than left at defaults.
6. **The queue-health alarm gained an explicit RLS table list**, so its disabled-RLS check cannot quietly miss a new table.
7. **The E2E suite caught the regression** — three specs, every affected page, with the exact offending selector and pixel delta.
8. **Security findings originate in-house**, now four rounds deep, tracked by ID and referenced in the fixing commits.
9. **Assigned reminders with a student-only mark-done path** — a narrow permission rather than a broad one, consistent with `manageAttendance` earlier.
10. **Commits that name their findings**, seventeen passes running.

---

_Revision 17 performed 2026-09-02 against `feature/cert-ed-academia-app` @ `11f92f1` with a
clean working tree, a clean `rm -rf .next` rebuild via the sanctioned `E2E_BUILD=1` path, and
serial execution of every gate. Not verified: why the admin persona passes the responsive
check when three others fail, which change reintroduced the overflow, whether the
teaching-hours aggregate path is indexed, whether Sentry DSNs are configured in Vercel, and
whether the production restore drill has been run._
