# Cert-Ed Academia — Production Readiness Audit

- **Date:** 2026-08-13 · **Revision 11**
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `04bb6fd` · **working tree clean**
- **Method:** static analysis plus live execution of `typecheck`, `lint`, `format:check`, `test:coverage`, clean `rm -rf .next && build`, `check:bundle`, `check:snapshot`, `npm audit --omit=dev`, the full Playwright suite, and `scripts/test-rls.sh` against real Postgres 18. Plus four controlled build experiments to isolate the one defect found (§2).
- **Scope:** production-readiness for an initial **~100-user** deployment
- **Supersedes:** [Revision 10](./2026-08-11-production-readiness-audit.md)

---

## 0. Verdict

**One defect stands between this application and production. Everything else on the R10 blocker list has been closed, and closed well.**

Two days of work have shipped custodial Drive storage, an email queue, audit-log retention, the mentor-dashboard batching, nonce-based CSP, the RLS harness in CI, CI failure artifacts, request-id correlation, an FK/cascade inventory, and five new operational runbooks. Nine of my ten R10 code findings are closed. That is an unusually high conversion rate, and several fixes are better than what I proposed.

**The defect is this: the production build command ships a broken message-thread page.**

`npm run build` uses `next build --webpack`. Under that bundler, the `MessageComposer` client component is omitted from the page's React client-reference manifest, so `/messages/[id]` throws server-side and renders its error boundary. Every user who opens a conversation sees "Something went wrong". I reproduced it live, read the server error, confirmed the omission in the built manifest, and verified a one-line fix. Details and evidence in §2.

This matters more than a normal E2E failure for two reasons. It only appears in the **production** build path — `next dev` is unaffected — so local development would never reveal it. And the obvious remedy is a trap: dropping `--webpack` fixes the manifest but reintroduces the PDF outage that flag was added to fix, and breaks 31 further E2E specs. I tested that, so you don't have to.

Overall project health: **9.1 / 10** (was 8.6 at R10). The rise reflects genuine closure across the board; it is held back only by the shipping defect and by the fact that the deployment-environment items remain unverifiable from the repository.

---

## 1. Verification results

| Gate                            | R10         | R11                         | Note                                        |
| ------------------------------- | ----------- | --------------------------- | ------------------------------------------- |
| `npm run typecheck`             | ✅          | ✅                          |                                             |
| `npm run lint`                  | ✅          | ✅                          |                                             |
| `npm run format:check`          | ❌ 2 files  | ✅                          | clean                                       |
| `npm run test:coverage`         | ❌ 1 failed | ✅                          | **924 passed / 119 files**, ratchet green   |
| `npm run build` (clean `.next`) | ✅          | ✅                          |                                             |
| `npm run check:bundle`          | —           | ✅                          | 127.4 / 145 KB, 17.6 KB headroom            |
| `npm run check:snapshot`        | ✅          | ✅                          | current at `0060`                           |
| `scripts/test-rls.sh`           | not run     | ✅                          | **34 passed, 0 failed** vs real Postgres 18 |
| `npm audit --omit=dev`          | ⚠️ 1 high   | ✅                          | **0**                                       |
| `npx playwright test`           | ❌ 2 real   | ❌ **3 failed / 62 passed** | one root cause — §2                         |

Ten of eleven gates green. The eleventh is one defect, not three.

---

## 2. 🔴 CRITICAL — the production build ships a broken `/messages/[id]`

### What happens

All three failing specs (`messaging.pw.ts` ×2, `notifications.pw.ts` ×1) fail waiting for the message composer. The page snapshot shows a **"Try again"** button — the error boundary, not a missing label. I started the production build in mock mode and read the server's stderr:

```
⨯ Error: Could not find the module
  "…\src\app\(prt)\messages\[id]\MessageComposer.tsx#MessageComposer"
  in the React Client Manifest.
```

Confirmed in the build output itself — `MessageComposer` is absent from its own page manifest, while sibling client components in the same route group are present:

```
.next/server/app/(prt)/messages/[id]/page_client-reference-manifest.js
  → grep MessageComposer  →  0
```

`MessageComposer.tsx` has `'use client'` as its first line and has not changed since `4b04ce7`. **This is a bundler fault, not a source fault.**

### Why it only bites here

`MessageComposer` is imported directly by a **server** page, making it a server→client boundary module — exactly the kind that requires a manifest entry. I scanned every server page in `(prt)` for locally-imported client components and checked each against its page manifest:

```
--- scan complete ---   (no other missing boundary module)
```

**Blast radius is exactly one route: `/messages/[id]`.** Components like `ClassCreateForm` and `NewMessageForm` also show no manifest entry, but they are nested inside other _client_ components, which correctly need none. I checked, because the raw numbers looked alarming and would have been easy to over-report.

### The trap: do not switch to Turbopack

The `--webpack` flag was added deliberately in `c5153f9`:

> _Next 16 builds with Turbopack by default, which does not honor `outputFileTracingIncludes` — so `@sparticuz/chromium`'s binary + fonts were left out of the serverless functions and every PDF route 502'd._

I tested Turbopack anyway, on the current tree. Both halves of that commit message still hold, and the cure is worse than the disease:

|                                    | `next build --webpack` (current) | `next build` (Turbopack)                                        |
| ---------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `MessageComposer` in manifest      | ❌ absent                        | ✅ present                                                      |
| Chromium traced into the PDF route | ✅                               | ❌ **no `chromium.br` / `fonts.tar.br`** — PDF routes would 502 |
| Playwright                         | **62 passed / 3 failed**         | **31 passed / ~34 failed**                                      |

**Keep `--webpack`.** Switching would trade one broken page for a broken PDF subsystem and a great deal else.

### The fix — verified, one line

The trigger is the `@/lib/ui` **barrel** import. Changing it to the concrete module and rebuilding with `--webpack`:

```diff
- import { Card } from '@/lib/ui'
+ import { Card } from '@/lib/ui/layout'
```

```
grep MessageComposer …/page_client-reference-manifest.js  →  1   ✅
```

I reverted this experiment; the working tree is clean.

**One caveat you should decide on deliberately.** [architecture-rules.md §7](../architecture-rules.md) says _"Import shared primitives from `@/lib/ui` — never from a route folder"_, and `src/lib/ui/index.ts` repeats it. The fix therefore conflicts with a documented rule. Note also that the barrel import is _necessary but not sufficient_ to trigger the bug — many barrel-importing boundary components register fine — so I have not fully characterised the trigger. Options, in my order of preference:

1. **Apply the one-line fix now**, and amend §7 to say: server components import the barrel; client components import the concrete module. Smallest change, unblocks production today.
2. **Add a build-time assertion** that every server→client boundary module appears in its page manifest, failing the build otherwise. This is the durable fix — it makes the whole class of defect unshippable, in the same spirit as the duplicate-migration-prefix guard and the snapshot pre-push hook. The scan I wrote for §2 is about ten lines; productionising it is maybe an hour.
3. Investigate the precise webpack trigger upstream. Worth doing, but not before launch.

**I would do 1 and 2 together.** The project's own strongest habit is turning a recurrence into a mechanical guard, and this defect is invisible in `dev`, invisible in `typecheck`, invisible in unit tests, and would have shipped had E2E not covered messaging.

---

## 3. R10 findings — status

### Closed

| R10 finding                                     | Status                                                                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** Working tree red                         | ✅ Tree clean; 924 unit tests pass                                                                                                                                                |
| **S1** 🔴 "Anyone with the link" file sharing   | ✅ **Closed at the root.** `drive-share.ts`, `picker.ts`, `drive-config.ts`, `picker-result.ts` all deleted. No `type: 'anyone'` grant anywhere in `src/`.                        |
| **S2** 🟠 No custody of uploaded files          | ✅ **Closed.** Custodial storage implemented — migration `0057`, `lib/attachments/`, `lib/services/attachments/{upload,read,reconcile}`, `lib/google/drive-storage*`.             |
| **S5** `/api/health` unthrottled DB hit         | ✅ Now serves a cached ping                                                                                                                                                       |
| **S6** CSP needs `unsafe-inline`/`unsafe-eval`  | ✅ **Closed.** Per-request nonce set in `proxy.ts` via `lib/security/csp.ts`; the static header is gone from `next.config.js`.                                                    |
| **S7** `nanoid` advisory                        | ✅ `npm audit --omit=dev` → 0                                                                                                                                                     |
| **§5.1** 🟠 Mentor dashboard N+1 (~142 queries) | ✅ **Closed and verified.** Per-mentee `menteeSignals` replaced by set-based reads: ~10 queries, flat, regardless of mentee count.                                                |
| **§5.2** Email fan-out on the request path      | ✅ Migration `0058` + `pending_emails` + drain route — **but see §4.1**                                                                                                           |
| **§5.4** `getOrgSettings()` uncached            | ✅ **Closed better than proposed.** Cross-request cache (`revalidate: 3600`) _plus_ a request-scoped `cache()` wrapper _plus_ `revalidateOrgSettings()` for read-your-own-writes. |
| **§4.2** `audit_log` unbounded                  | ✅ Migration `0059` — 24-month `pg_cron` purge, with the reasoning recorded                                                                                                       |
| **§10** RLS harness not in CI                   | ✅ Wired as a job with a `postgres:18` service container                                                                                                                          |
| **§11** No CI failure artifacts                 | ✅ `playwright-report/` uploaded — closed after six passes                                                                                                                        |
| **§11** No request correlation id               | ✅ `lib/observability/request-context.ts` threads `x-vercel-id` into logs and Sentry                                                                                              |
| **FIND-27** No FK/cascade inventory             | ✅ `docs/fk-cascade-inventory.md`                                                                                                                                                 |
| **§9** `receipt/`, `.agents/`                   | ✅ Removed                                                                                                                                                                        |

### Environment blockers — now documented, still unverified

R10's B2–B7 were all operational. Every one now has a runbook, which is the right response to an item I cannot verify from a repository:

| Blocker                                  | Documentation                                                          | Verified?                               |
| ---------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| **B2** Supabase backups + PITR           | `production-checklist.md`, `operations.md`                             | ❌ **Not verified** — dashboard setting |
| **B3** Auth email → custom SMTP (Resend) | `deployment.md §2`, with the symptom in `operations.md`'s triage table | ❌ **Not verified**                     |
| **B4** Vercel Pro (commercial licence)   | `deployment.md §1` states it plainly                                   | ❌ **Not verified**                     |
| **B5** Supabase region = `bom1`          | `production-checklist.md`, first DB item                               | ❌ **Not verified**                     |
| **B6** Preview/production separation     | `production-checklist.md`, `environment.md`                            | ❌ **Not verified**                     |
| **B7** Restore drill                     | `operations.md#backups-and-restore`                                    | ❌ **Not verified**                     |

**These six remain genuine go-live gates.** Documenting a gate is not passing it. The `operations.md` symptom-to-cause triage table is a particularly good artifact — it turns each of these into something a non-author can diagnose at 2 a.m.

### Still open

| Finding                                          | Severity  | Note                                                                                                                                                                                                                                               |
| ------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§5.3** Unbounded analytics reads               | 🟡 Medium | Unchanged. `sumResourceDownloads()` still fetches every active resource row to sum in JS; the three attendance/session reads still have no date bound. Correct and cheap today; a year-two item. Push the sum into SQL and bound the rest by term. |
| **§9** `design_assets/` — 14 binaries, **19 MB** | 🟢 Low    | Still tracked. Repo is 23.3 MB, and this is 19 MB of it. Runtime assets already exist as PNG/SVG under `docs/assets/internal/brand-package/`.                                                                                                      |
| **NEW-28** `.githooks/pre-push` is mode `100644` | 🟡 Medium | Confirmed still `100644`. Git **silently skips** a non-executable hook on macOS/Linux, so the snapshot guard is inert for anyone not on Windows. One command: `git update-index --chmod=+x .githooks/pre-push`.                                    |
| **FIND-29** No dark mode                         | 🟡 Medium | Twelfth pass. Implement, or drop the dark `themeColor`.                                                                                                                                                                                            |
| **M5** Ratchet bundle budget 145 → 133           | 🟢 Low    | The script prints the recommendation on every run                                                                                                                                                                                                  |

---

## 4. New findings

### 4.1 🟠 HIGH — two of the three scheduled jobs are not scheduled

`vercel.json` still declares exactly one cron:

```json
{ "regions": ["bom1"], "crons": [{ "path": "/api/cron/keepalive", "schedule": "0 6 * * *" }] }
```

But production now needs three:

| Job                      | Route                             | If it never runs                                                          |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------- |
| Keepalive                | `/api/cron/keepalive`             | ✅ scheduled                                                              |
| **Email drain**          | `/api/cron/drain-emails`          | **Every notification email queues in `pending_emails` and is never sent** |
| **Attachment reconcile** | `/api/cron/reconcile-attachments` | Orphaned Drive files and stuck `pending` rows accumulate forever          |

To be fair to the authors, this is _documented_, in [deployment.md](../deployment.md) with a table naming these exact consequences, and migration `0058` ships both scheduling options commented at the bottom. It is a known manual step, not an oversight.

**It is still a finding, for two reasons.** First, moving email to a queue was a strict improvement _only if the drain runs_; until it does, the queue is a regression from inline sending — mail used to go, and now it silently does not. Second, a step that depends on a human remembering at deploy time is exactly the category this project has repeatedly, and rightly, converted into something mechanical.

**Recommendation:** commit both entries to `vercel.json` so the schedule is declarative and reviewable, rather than a checklist item:

```json
{
  "regions": ["bom1"],
  "crons": [
    { "path": "/api/cron/keepalive", "schedule": "0 6 * * *" },
    { "path": "/api/cron/drain-emails", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/reconcile-attachments", "schedule": "0 3 * * *" }
  ]
}
```

Sub-daily schedules need Vercel Pro, which is already required for the commercial licence (B4). If you stay on `pg_cron + pg_net` instead, say so in `vercel.json` with a comment pointing at the migration, so the absence is visibly deliberate.

### 4.2 🟡 MEDIUM — nothing watches the queue

`pending_emails` has no depth or age alarm. If the drain is unscheduled, misconfigured, or failing on a Resend credential, the only symptom is mail not arriving — which nobody reports, because nobody knows to expect it. The same applies to attachments stuck in `failed`.

**Recommendation:** have `/api/cron/keepalive` — which already runs daily and is already authenticated — additionally count `pending_emails` older than an hour and `attachments` in `failed`, and `logError` when either is non-zero. That routes to Sentry, which you already have. Perhaps 20 lines, and it converts two silent failure modes into alerts.

### 4.3 ℹ️ INFORMATIONAL — inline preview is safe only because of the allowlist

`/api/attachments/[id]/download?inline=1` streams with `Content-Type: attachment.mime_type` and `Content-Disposition: inline`. That is safe today because the extension/MIME allowlist in `lib/attachments/validation.ts` excludes `html` and `svg`. If anyone ever adds `svg` to that allowlist, this route becomes stored XSS — `nosniff` does not help when the declared type is `image/svg+xml`.

Not a defect. Worth a comment in `EXTENSION_MIME` saying that adding a browser-executable type there has a second consequence at the download route.

---

## 5. The custodial Drive implementation — assessment

**This is the best-executed piece of work in the repository, and it improves on the design I proposed.**

| Requirement (R10 §7)                     | Implementation                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Server owns files, not users             | `GOOGLE_DRIVE_*` are **server-only** — no `NEXT_PUBLIC_` Google vars remain                         |
| No public sharing                        | All sharing code deleted; downloads stream through the app                                          |
| Two-phase commit                         | `upload.ts`: validate → `INSERT pending` → Drive → `UPDATE active`, `failed` on error, then rethrow |
| `appProperties` for reconciliation       | `{ attachmentId, env }` stamped on every file                                                       |
| Bidirectional orphan sweep               | `reconcile.ts` — stale `pending` → `failed`, then orphan files deleted; the two compose in one run  |
| Env + date folders                       | `{env}/{owner}/{yyyy}/{mm}`                                                                         |
| DB is source of truth for classification | Yes                                                                                                 |
| Validation                               | Extension allowlist + MIME cross-check + **magic-byte sniff**                                       |
| Filename sanitization                    | NFC, basename only, control chars stripped by code point, no leading dot, length cap                |
| Private download                         | RLS-authorized, identical 404, `private, no-store`                                                  |

Three things it does better than I specified:

- **`DANGEROUS_INNER`** rejects a masked second extension (`cv.pdf.exe`) — I did not think of that.
- **Authorization is delegated to RLS** rather than re-derived in the route, with the reasoning written down: _"Re-deriving those three rules in app code would only invite drift, which is what that policy is written to avoid."_ That is the correct instinct and it is now verified by three of the 34 RLS assertions, including one proving a `pending` attachment is invisible.
- **RFC 5987 `Content-Disposition`**, so a non-ASCII filename survives the round trip.

The `0057` migration in the tree matches what I verified against Postgres 18 at R10, and the RLS harness now exercises its policies for real.

---

## 6. Database

36 tables (+2), 60 indexes (+5), 71 policies (+1), chain `0001`–`0060`, snapshot current, **34 RLS assertions passing** against real Postgres 18.

The R10 capacity estimate holds and has improved slightly:

- The `attachments` table adds ~300 bytes per upload — ~3.6 MB/year at 12,000 submissions. Immaterial, and **no file bytes enter Postgres**, which was the load-bearing condition.
- `pending_emails` is self-purging (sent/failed rows dropped after 7 days).
- **`audit_log`'s 24-month cap (`0059`) is the meaningful change.** It was the largest table and the only unbounded one; growth is now bounded at ~50 MB steady-state instead of ~25 MB/year forever.

**Year-1 projection: ~145 MB against the 500 MB Free-tier limit, now with a genuine ceiling rather than an open-ended slope.** Database _size_ remains a non-issue. Backups (B2) remain the reason to upgrade.

---

## 7. Prioritised plan

### Before production

| #   | Action                                                                                          | Finding | Effort |
| --- | ----------------------------------------------------------------------------------------------- | ------- | ------ |
| 1   | **Fix the `MessageComposer` barrel import**, then re-run Playwright                             | §2      | 10 min |
| 2   | **Add a build-time boundary-manifest assertion** so this class can't ship again                 | §2      | ~1 h   |
| 3   | Amend `architecture-rules.md §7` for client components                                          | §2      | 10 min |
| 4   | **Commit the drain + reconcile crons to `vercel.json`**                                         | §4.1    | 15 min |
| 5   | `git update-index --chmod=+x .githooks/pre-push`                                                | NEW-28  | 1 min  |
| 6   | **Supabase Pro — backups + PITR on**                                                            | B2      | 15 min |
| 7   | **Auth email → custom SMTP (Resend)**, and send yourself a real reset                           | B3      | 30 min |
| 8   | **Vercel Pro** (commercial licence; also enables sub-daily crons)                               | B4      | 15 min |
| 9   | **Verify the Supabase region is `bom1`**                                                        | B5      | 5 min  |
| 10  | Separate preview Supabase project + Drive folder                                                | B6      | 2 h    |
| 11  | **Perform the restore drill**                                                                   | B7      | 2 h    |
| 12  | Smoke-test one PDF render on deployed Vercel (the `--webpack` tracing this depends on)          | §2      | 15 min |
| 13  | End-to-end Drive test on production credentials: upload, download, delete, and a forced failure | §5      | 1 h    |

### Soon after

| #   | Action                                                      | Finding |
| --- | ----------------------------------------------------------- | ------- |
| 14  | Queue-depth + failed-attachment alarm in the keepalive cron | §4.2    |
| 15  | Bound the analytics reads; push the download sum into SQL   | §5.3    |
| 16  | `git rm -r design_assets` (19 MB of a 23 MB repo)           | §9      |
| 17  | Note the browser-executable-type hazard in `EXTENSION_MIME` | §4.3    |
| 18  | Dark mode, or drop the dark `themeColor` (twelfth pass)     | FIND-29 |
| 19  | Ratchet `firstLoadSharedKb` 145 → 133                       | M5      |

---

## 8. Scorecard

| Dimension            |   R10   |   R11   | Justification                                                                                                                                            |
| -------------------- | :-----: | :-----: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture         |    9    |  **9**  | Layering holds through a large refactor and a new subsystem                                                                                              |
| Security             |    6    |  **9**  | S1 and S2 closed at the root; nonce CSP; RLS harness in CI at 34 assertions. −1 while B2/B3/B6 are unverified                                            |
| Maintainability      |    9    |  **9**  | Five new runbooks, FK inventory, design-system consolidation                                                                                             |
| Performance          |    8    |  **9**  | The 142-query dashboard is now ~10 and flat; org settings properly cached                                                                                |
| Scalability          |    8    |  **9**  | Email off the request path; audit log bounded. −1 until the drain is scheduled                                                                           |
| Documentation        |   10    | **10**  | `operations.md`'s symptom→cause triage table is genuinely excellent                                                                                      |
| Testing              |    8    |  **9**  | 924 unit tests, RLS in CI, artifacts uploaded. −1: E2E red                                                                                               |
| Developer Experience |    9    |  **9**  | Correlation ids, CI artifacts. −1: the pre-push hook is inert off Windows                                                                                |
| User Experience      |    9    |  **8**  | −1: message threads are broken in the production build                                                                                                   |
| Code Quality         |    9    | **10**  | All gates green but one; the Drive implementation is exemplary                                                                                           |
| **Overall**          | **8.6** | **9.1** | Nine of ten R10 code findings closed in two days, several better than proposed. Held back by one shipping defect and six unverifiable environment gates. |

---

## 9. What I got wrong last time, and what changed

Two corrections worth recording, since this document is the project's memory:

- **R10 §9 recommended removing `design_assets/`, claiming the repo would drop "from 21.7 MB to under 3 MB".** `receipt/` and `.agents/` were removed; `design_assets/` was kept, and the repo has _grown_ to 23.3 MB. The recommendation still stands, but my figure assumed a removal that hasn't happened and, since `git rm` does not rewrite history, the pack size would not have fallen as far as I implied either. The honest benefit is faster checkouts and no further growth, not a 19 MB reclaim.
- **Mid-investigation this pass I briefly concluded that all 12 barrel-importing client components were broken.** They were not — most are nested client components that correctly need no manifest entry. The scan in §2 is what settled it, and the real blast radius is one route. I am recording this because the raw grep looked alarming and would have made an eye-catching finding that happened to be false.

---

_Revision 11 performed 2026-08-13 against `feature/cert-ed-academia-app` @ `04bb6fd`, working tree clean, with a clean rebuild, the full Playwright suite, the RLS harness against real Postgres 18, and four controlled build experiments (webpack vs Turbopack manifest registration; Turbopack PDF tracing; full-suite comparison; concrete-module import fix). All experimental edits were reverted and the tree verified clean. Items that could not be verified from the repository — Supabase plan, region, backups and SMTP; Vercel plan; whether the cron jobs are scheduled by another mechanism; and the precise upstream webpack trigger — are labelled_ **Not verified** _in place._
