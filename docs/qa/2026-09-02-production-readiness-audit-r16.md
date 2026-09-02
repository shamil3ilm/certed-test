# Cert-Ed Academia — Production Readiness Audit

- **Date:** 2026-09-02 · **Revision 16** (production-readiness series)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `11f92f1`, chain head `0089` · **working tree clean**
- **Method:** every gate executed individually, plus an **independent chain-vs-snapshot privilege diff** on real Postgres 18 that re-tests the R15 finding without relying on the project's own new gate
- **Scope:** production-readiness for an initial **~100-user** deployment
- **Supersedes:** [Revision 15](./2026-08-26-production-readiness-audit-r15.md)

---

## 0. Verdict

**Every gate is green, and both R15 findings are closed — one of them verified independently rather than taken on trust.**

|                       | R15     | R16                          |
| --------------------- | ------- | ---------------------------- |
| Unit tests            | 1179    | **1265**                     |
| RLS assertions        | 67      | **86**                       |
| E2E                   | 68 / 69 | **69 / 69**                  |
| Privilege parity gate | —       | **new, passing (3427 rows)** |

The R15 headline — a privilege epilogue that read correctly and _did nothing_ — is fixed at both levels. The statements are schema-qualified, and there is now a `scripts/test-privilege-parity.sh` wired into CI whose own comment states the purpose exactly:

> _"the only gate that catches a snapshot whose privilege epilogue reads correctly but does not execute"_

I did not accept that gate's verdict on its own — a broken check passing was the whole failure mode last pass. I provisioned two databases myself, one from the chain and one from the snapshot, applied the snapshot with errors visible, and diffed effective privileges. **No errors, and the two privilege sets are identical.** R-01 is closed on evidence.

Three other things landed that were mine to raise and are now better than I asked for: the mock's `teaches_class` gained its mentor branch (E2E is green again), `0088` gave `profiles` a real erasure path, and `playwright.config.ts` now sets `reuseExistingServer: false` carrying the precise stale-server reasoning from my R13 report.

Two small new findings, neither a defect: a **local `npm run build` now fails for any developer who followed `.env.example`** (§3), and `lint` has no `--max-warnings`, so one warning is sitting in the tree unnoticed (§4).

Overall project health: **9.6 / 10** (was 9.4). The strongest state measured across seven passes, and the remaining work is almost entirely outside the repository.

---

## 1. Verification results

| Gate                                   | R15     | R16 | Note                                     |
| -------------------------------------- | ------- | --- | ---------------------------------------- |
| `npm run typecheck`                    | ✅      | ✅  |                                          |
| `npm run lint`                         | ✅      | ✅  | exits 0; **1 warning** — §4              |
| `npm run format:check`                 | ✅      | ✅  |                                          |
| `npx vitest run`                       | ✅ 1179 | ✅  | **1265 passed / 166 files** (+86)        |
| `npm run build` (clean `.next`)        | ✅      | ✅  | manifest guard OK, 25 pages — but see §3 |
| `npm run check:bundle`                 | ✅      | ✅  | 127.4 / 133 KB                           |
| `npm run check:snapshot`               | ✅      | ✅  | current at `0089`                        |
| `scripts/test-rls.sh`                  | ✅ 67   | ✅  | **86 passed, 0 failed** (+19)            |
| **`scripts/test-privilege-parity.sh`** | —       | ✅  | **new** — 3427 privilege rows, identical |
| `npm audit --omit=dev`                 | ✅ 0    | ✅  | 0                                        |
| `npx playwright test`                  | ❌ 1    | ✅  | **69 passed, 0 failed**                  |

Second consecutive pass with **no false alarms of my own** — every gate's first run was its final result.

---

## 2. R-01 — closed, and verified without trusting the new gate

### What changed

The epilogue is now schema-qualified (lines 4420–4424):

```sql
revoke insert, update on table public.submissions   from authenticated;
revoke select        on table public.class_sessions from authenticated;
revoke update        on table public.notifications  from anon, authenticated;
revoke update        on table public.profiles       from authenticated;
```

And `scripts/test-privilege-parity.sh` provisions a database both ways and compares effective privileges — the check I described in R15 §2, implemented as specified.

### My independent verification

The lesson of R15 was that a fix can pass every text-based inspection and still not run, so a _new gate reporting success_ is exactly the kind of claim worth re-deriving. I built both databases myself, Supabase-faithful (default privileges granting `authenticated` table DML before any object exists):

```
=== snapshot apply: any epilogue errors? ===
(no lines)                      ← previously 5 × "relation does not exist"

=== diff chain vs snapshot: authenticated table privileges ===
*** IDENTICAL — R-01 verifiably closed ***
```

The five divergences I measured in R13 and again in R15 — `profiles UPDATE`, `submissions INSERT/UPDATE`, `class_sessions SELECT`, `notifications UPDATE` — are gone. The project's own gate agrees, comparing 3427 privilege rows.

**This closes the longest-running finding in the series**, first raised in R13 and carried through two passes, one of which recorded it as fixed when it was not.

---

## 3. 🟡 MEDIUM — `npm run build` fails for a developer following the documented setup

```
Error: [build] Mock-only env var(s) set in a production deployment: MOCK_MODE, NEXT_PUBLIC_MOCK_MODE.
    at Object.<anonymous> (next.config.js:48:11)
```

I hit this on a plain `npm run build` with a clean tree and nothing unusual in my shell (`MOCK_MODE` was empty there). The cause is the documented local setup:

- `.env.example` instructs copying to `.env.local` with `MOCK_MODE=1` / `NEXT_PUBLIC_MOCK_MODE=1` — the intended way to run locally.
- `next build` sets `NODE_ENV=production`.
- The guard sanctions mock vars only when `NODE_ENV !== 'production'`, `VERCEL_ENV === 'preview'`, or `E2E_BUILD=1`.

So the _supported_ local configuration makes the _supported_ build command fail hard.

**The guard itself is right, and I would not weaken it.** It fails closed by design ("a self-hosted `next start` build carrying mock vars is caught too"), it is backed by `tests/unit/mock-env-guard.test.ts` asserting list parity with the runtime backstop, and the E2E path is correctly sanctioned via `E2E_BUILD: '1'` in `playwright.config.ts`. Setting that flag, the build succeeds and the manifest guard passes across 25 pages.

The gap is that nothing tells a developer this. Options, cheapest first:

1. **One line in `.env.example` and `mock-mode.md`**: `npm run build` is a production build; either unset the mock vars or use the local build command below.
2. **A `build:local` script** — `cross-env E2E_BUILD=1 next build …` — so there is a sanctioned way to compile locally without editing `.env.local`.
3. Extend the error message itself with _"if you are building locally with mock mode on, use `npm run build:local`"_ — the message currently gives production advice ("Remove them from the Production environment and redeploy") to someone sitting at their laptop.

I would do 1 and 3. The error is otherwise excellent — it names the variables and explains the risk.

---

## 4. 🟢 LOW — `lint` has no `--max-warnings`, and one warning is already sitting in the tree

```
tests/unit/services/teaching-hours.test.ts
  18:52  warning  'selectActiveClassIdsAmong' is defined but never used
```

`"lint": "eslint"` with no `--max-warnings`, so ESLint exits 0 and CI is green. That is a fine default for most projects, but it is out of step with this one: every other gate here is a ratchet (bundle budget, coverage, snapshot freshness, RLS coverage parity, privilege parity). A warning channel nobody fails on will accumulate.

**Recommendation:** remove the unused import, then set `"lint": "eslint --max-warnings 0"`. Do them in that order so the change lands green.

---

## 5. R15 and earlier findings — status

### Closed

| Finding                                                    | Status                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R15 §2** 🟠 Snapshot privilege epilogue does not execute | ✅ **Closed and independently verified** (§2), plus a CI gate that will catch the next divergence                                                                                                                                                                         |
| **R15 §3** 🟠 Mock `teaches_class` has no mentor branch    | ✅ **Closed.** The mock now models tutor-OR-mentor for the read scope and tutor-only for `teaches_class_write`, with a comment explaining that post-`0082` the two genuinely diverge. `scoping.pw.ts:84` passes.                                                          |
| **R14 §4.2** No retention or erasure path for `profiles`   | ✅ **Closed by `0088`.** `eraseUser` anonymises PII in place, keeps the row so audit and finance references survive under their own lawful basis, stamps `erased_at`, and restore refuses an erased account. Well reasoned.                                               |
| **R13 §1.1** Stale-server trap in the E2E config           | ✅ **Closed.** `reuseExistingServer: false` with a comment describing the exact failure I hit — _"reusing a stale :3100 that was serving the OLD build makes its HTML reference chunks that no longer exist … a phantom 'regression' that is really a build/serve skew."_ |

### Partially addressed

**R10 §5.3 — unbounded analytics reads.** All four now route through `fetchAllPaged`, and a date-bounded `selectSessionsForClassesInRange` was added for teaching-hours.

The paging fixes a **latent correctness bug I had not flagged**: PostgREST caps a select at 1000 rows by default, so `sumResourceDownloads` would have silently under-counted once the academy passed 1000 active resources. That is a better catch than my original point.

What remains is the original point: `sumResourceDownloads` still transfers every row to sum in JavaScript rather than pushing `SUM()` into Postgres, and `selectSessionsForClasses`, `selectTimedAttendanceForStudent` and `selectAttendanceStatusesForClasses` still have no date window. Paging makes them correct as they grow, and slightly slower — N round-trips instead of one. Still a year-two item, not a launch blocker.

### Still open

| Finding                                            | Severity | Note                        |
| -------------------------------------------------- | -------- | --------------------------- |
| **R10 §9** `design_assets/` — 14 binaries, 19 MB   | 🟢 Low   | Unchanged across six passes |
| **R11 §4.3** `EXTENSION_MIME` executable-type note | 🟢 Low   | Unchanged                   |

### Deployment gates — now the entire remaining critical path

B2 (Supabase Pro + backups), B3 (custom SMTP → Resend), B4 (Vercel Pro), B5 (region `bom1`), B6 (preview/production separation), the **B-02** Supabase auth dashboard cluster, wiring the **drain + reconcile crons** on the production project, and a **real restore drill against an actual Supabase backup** all remain **Not verified**.

With §3 and §4 being a documentation line and a lint flag, **there is no longer any engineering work between this codebase and production.** Everything left is someone opening a dashboard.

---

## 6. Database

**48 tables, chain `0001`–`0089`**, snapshot current, **86 RLS assertions passing**, privilege parity verified.

New since R15: guardian consent, note minimisation, profile erasure (`0088`), audit metadata (`0089`), mentee-note length limits, teaching-hours with class isolation, assigned reminders, mentor session-time editing.

Capacity is unchanged and remains comfortable: **year-1 ≈ 145 MB against the 500 MB Free-tier limit**, `audit_log` capped at 24 months, the new tables all per-relationship and small. Database size is still not a reason to upgrade; **backups still are, and B2 is still unconfirmed.**

The RLS harness has gone 34 → 64 → 67 → **86** assertions across four passes while the schema grew, which is the ratio you want — coverage outpacing surface.

---

## 7. Prioritised plan

### Engineering — under an hour, all optional for launch

| #   | Action                                                                                       | Finding | Effort |
| --- | -------------------------------------------------------------------------------------------- | ------- | ------ |
| 1   | Document the local-build/mock-var interaction; extend the guard's message for the local case | §3      | 15 min |
| 2   | Remove the unused import, then `eslint --max-warnings 0`                                     | §4      | 10 min |
| 3   | `git rm -r design_assets`                                                                    | §5      | 10 min |
| 4   | `EXTENSION_MIME` executable-type comment                                                     | §5      | 5 min  |

### Environment — the actual critical path

| #   | Action                                                                                       | Finding | Effort |
| --- | -------------------------------------------------------------------------------------------- | ------- | ------ |
| 5   | **Supabase Pro — backups + PITR on**                                                         | B2      | 15 min |
| 6   | **Run the real restore drill** against a Supabase backup, including a Drive attachment       | B7      | 2 h    |
| 7   | **Auth email → custom SMTP (Resend)**; receive a real reset                                  | B3      | 30 min |
| 8   | **Vercel Pro**; confirm region `bom1`                                                        | B4/B5   | 30 min |
| 9   | **Wire the drain + reconcile jobs**; verify one run of each                                  | carried | 30 min |
| 10  | Preview/production separation                                                                | B6      | 2 h    |
| 11  | **Walk the Supabase auth dashboard**; record every setting                                   | B-02    | 30 min |
| 12  | **Set the OAuth consent screen to `In production`**; capture the refresh token               | carried | 15 min |
| 13  | Smoke-test on deployed infrastructure: sign-in, a PDF render, a Drive upload/download/delete | —       | 1 h    |

### Later

Push `SUM()` into Postgres and add a term window to the three all-time analytics reads (§5).

---

## 8. Scorecard

| Dimension            |   R15   |   R16   | Justification                                                                                                                                                                                                                                           |
| -------------------- | :-----: | :-----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture         |    9    |  **9**  | Erasure, consent and teaching-hours absorbed without strain                                                                                                                                                                                             |
| Security             |    9    | **10**  | +1: R-01 closed and independently verified; 86 RLS assertions; a privilege-parity gate that catches non-executing SQL                                                                                                                                   |
| Maintainability      |   10    | **10**  | Findings keep becoming gates, and the gates carry the reasoning that produced them                                                                                                                                                                      |
| Performance          |    9    |  **9**  | Paging fixed a latent truncation bug; JS-side aggregation remains                                                                                                                                                                                       |
| Scalability          |   10    | **10**  | Queue-health alarm holding; analytics now correct as data grows                                                                                                                                                                                         |
| Documentation        |   10    |  **9**  | −1: the documented local setup breaks the documented build command (§3)                                                                                                                                                                                 |
| Testing              |    9    | **10**  | +1: 1265 unit tests, 86 RLS assertions, 69/69 E2E, and a new gate class                                                                                                                                                                                 |
| Developer Experience |   10    |  **9**  | −1: §3 — a developer following the quick-start cannot run `npm run build`                                                                                                                                                                               |
| User Experience      |    9    |  **9**  | Unchanged                                                                                                                                                                                                                                               |
| Code Quality         |   10    | **10**  | Every gate green; one stray warning (§4)                                                                                                                                                                                                                |
| **Overall**          | **9.4** | **9.6** | Strongest state across seven passes. The longest-running finding is closed on independent evidence, the guard that would have missed it has been replaced by one that catches it, and no engineering work remains between this codebase and production. |

---

## 9. On the one thing I did differently

R15 ended with a fix that passed inspection and failed execution, and with my own admission that the guard I had recommended would have certified it. So this pass I treated the project's **new** privilege-parity gate the same way I would treat any other claim: I re-derived its result independently before believing it.

It held. But the habit is the point, and it generalises past this project: **a green check is evidence that a check ran, not that the thing it checks is true.** The only way to know was to provision both databases and diff them — which is also, not coincidentally, exactly what the new gate does. Where a project's guard and my own verification converge on the same method, that is a good sign the method is right.

Two passes now with no false alarms of my own, after three consecutive passes with them. Running each gate individually, on this machine, is what changed.

---

_Revision 16 performed 2026-09-02 against `feature/cert-ed-academia-app` @ `11f92f1` (chain head `0089`), working tree clean, with each gate executed individually and an independent chain-vs-snapshot privilege diff on real Postgres 18. All probe databases were dropped; no application code was modified — the only file written is this report. Items that could not be verified from the repository — Supabase plan, region, backups, SMTP and auth dashboard settings; Vercel plan; the Google OAuth consent-screen publishing status; whether the drain/reconcile jobs are scheduled; and a restore from a real Supabase backup — are labelled_ **Not verified** _in place._
