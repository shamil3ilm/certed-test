# Cert-Ed Academia — Production Readiness Audit

- **Date:** 2026-09-05 · **Revision 17** (production-readiness series)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `0f999c8`, chain head `0095`
- **Method:** every gate executed individually, plus a hand-walked migration chain on real Postgres 18 to separate two harness provisioning races from apparent assertion failures
- **Scope:** production-readiness for an initial **~100-user** deployment
- **Supersedes:** [Revision 16](./2026-09-02-production-readiness-audit-r16.md)

> **Tree state.** Nine files were uncommitted when I ran: `.github/workflows/ci.yml`, `.nvmrc`, `package.json`, `CONTRIBUTING.md`, `README.md` and four E2E specs — an in-flight **Node 20 → 22** pin. My gates ran against that tree on **Node v24.13.1**, which satisfies neither the old `>=20` nor the new `"node": "22.x"` engine field. There is no `.npmrc` enforcing engines, so nothing failed, but treat the numbers as "passes on Node 24" rather than "passes on the pinned runtime".

---

## 0. Verdict

**Ten of eleven gates are green, the suite has grown substantially again, and the one red gate is a build-time dependency advisory with no runtime reach.**

|                  | R16       | R17           |
| ---------------- | --------- | ------------- |
| Unit tests       | 1265      | **1350**      |
| RLS assertions   | 86        | **96**        |
| E2E              | 69 / 69   | **79 / 79**   |
| Privilege parity | 3427 rows | **3428 rows** |
| Chain head       | 0089      | **0095**      |

Both R16 findings are closed, and closed the way I suggested: `.env.example` now warns that `npm run build` is a production build and names the two escapes, and `lint` is `eslint --max-warnings 0` with the stray warning cleaned up first so the change landed green. A third, carried since R11, closed too — `EXTENSION_MIME` now tells you to weigh the download-route effect before adding a type. And the blog moved to MDX under `src/content/blog/*.mdx`, closing a finding first raised at R9.

Two things are worth your attention, neither a defect in the application:

- **`npm audit --omit=dev` is no longer clean** — one high advisory (`fast-uri`) arriving through `@mdx-js/loader → webpack → schema-utils → ajv`. A build-time path with no attacker-controlled input, so real exploitability is nil, but it breaks a gate that has been green for six passes (§2).
- **The three database scripts share an unchecked provisioning step**, and it bit twice in this single pass — once reporting `database "certed_rls_test" does not exist`, once reporting **39 assertion failures** about a column that demonstrably exists. I proved both were provisioning races, not defects (§3). Third consecutive pass this has happened, and it is no longer fair to call it my machine.

Overall project health: **9.6 / 10** (unchanged). The codebase improved; the two items above offset it.

---

## 1. Verification results

| Gate                               | R16         | R17 | Note                                     |
| ---------------------------------- | ----------- | --- | ---------------------------------------- |
| `npm run typecheck`                | ✅          | ✅  |                                          |
| `npm run lint`                     | ✅ (1 warn) | ✅  | **now `--max-warnings 0`** and clean     |
| `npm run format:check`             | ✅          | ✅  |                                          |
| `npx vitest run`                   | ✅ 1265     | ✅  | **1350 passed / 170 files** (+85)        |
| `npm run build` (clean `.next`)    | ✅          | ✅  | manifest guard OK, **26 pages**          |
| `npm run check:bundle`             | ✅          | ✅  | 127.4 / 133 KB — flat for nine passes    |
| `npm run check:snapshot`           | ✅          | ✅  | current at `0095`                        |
| `scripts/test-rls.sh`              | ✅ 86       | ✅  | **96 passed, 0 failed** (+10) — after §3 |
| `scripts/test-privilege-parity.sh` | ✅          | ✅  | 3428 rows, identical                     |
| `npm audit --omit=dev`             | ✅ 0        | ❌  | **1 high** — §2                          |
| `npx playwright test`              | ✅ 69       | ✅  | **79 passed, 0 failed** (+10)            |

---

## 2. 🟡 MEDIUM — `npm audit` regression: `fast-uri`

```
fast-uri  3.0.0 - 3.1.5   Severity: high
  host confusion via skipped IDN canonicalization
  SSRF via malformed IPv6 normalization
  SSRF via repeated hostname percent-decoding
  host confusion via percent-encoded scheme normalization
```

The path is entirely build-time:

```
@mdx-js/loader → webpack → schema-utils → ajv → fast-uri
```

`schema-utils` uses `ajv` to validate **webpack loader options** during the build. Nothing attacker-controlled reaches `fast-uri`, and it is on no server or client runtime path. **Real exploitability here is nil** — the same shape as the `nanoid` advisory I raised at R10, which was resolved with an override.

It still matters, because it breaks a gate that has been clean for six passes and because `production-checklist.md` lists `npm audit --omit=dev` returning 0 as a go-live item.

**Two fixes, either acceptable:**

1. **An `overrides` entry**, consistent with what is already there (`{"undici":"^7.29.0","nanoid":"^3.3.17"}`) — add `fast-uri` pinned to a patched release. Lowest risk, matches the existing pattern.
2. **Move `@mdx-js/loader` to `devDependencies`.** It is a webpack loader that only runs at build time; `@mdx-js/react` (runtime) and `@next/mdx` (config) stay put. This removes the path from the production tree rather than pinning around it. Next's own docs put the loader in `dependencies`, so this is a deliberate deviation — worth a comment if you take it.

I would do **1** now and consider **2** as cleanup.

---

## 3. 🟡 MEDIUM — three DB scripts provision without checking, and it manufactures convincing false failures

This is the finding I am most confident is worth acting on: it cost me two diagnostic detours in one pass, and would cost a CI reader the same.

**What I saw.** The RLS harness, run twice in succession:

```
run 1:  MIGRATION FAILED: supabase/migrations/0023_messaging_integrity.sql
        psql: FATAL: database "certed_rls_test" does not exist

run 2:  FAIL 0095: a malformed billing_period is rejected
        ERROR: column "billing_period" of relation "receipts" does not exist
        == RLS RESULT: 57 passed, 39 failed ==
```

The second is the dangerous one: **39 failures that look exactly like a broken migration**. It names a real column, in a real new migration (`0095_hours_billing.sql`), with a plausible story — a schema change that did not land.

**What is actually true.** I walked the full `0001`–`0095` chain by hand into a fresh database with `ON_ERROR_STOP=1`:

```
(no failure)
--- column present? ---
1
```

The chain applies cleanly and `receipts.billing_period` exists. Migration `0095` line 86 adds it, the snapshot carries 22 references, and a third harness run — with no other database activity — returned **96 passed, 0 failed**.

**The cause.** All three database scripts share this pattern:

```bash
psql -h $HOST -U $USER -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
```

- `scripts/test-rls.sh:18`
- `scripts/test-privilege-parity.sh:64,73`
- `scripts/restore-drill.sh:52,78`

Output is discarded and **the exit status is never checked**. `DROP DATABASE` fails whenever any connection to it lingers — precisely what happens when these run close together, or when a prior run was interrupted. The script then proceeds against a database that is missing, or half-built from the previous run, and reports the consequences as assertion failures.

**Fix — small, and uniform across all three:**

```bash
psql -h $HOST -U $USER -q -c \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname='$DB' and pid <> pg_backend_pid()" >/dev/null 2>&1
psql -h $HOST -U $USER -q -v ON_ERROR_STOP=1 \
  -c "drop database if exists $DB" -c "create database $DB" >/dev/null \
  || { echo "provisioning FAILED for $DB - not a test failure"; exit 1; }
```

This is squarely in the project's own idiom. Every other guard here fails loudly and names its cause — the duplicate-migration-prefix check, the snapshot-freshness hook, the client-manifest assertion, the mock-var guard. These three scripts are the one place where a failure is silently converted into a misleading one.

**Why it matters beyond my machine:** in CI a lingering connection produces the same 39 red assertions, and whoever reads that build goes looking for a schema bug that does not exist.

---

## 4. R16 findings — status

### Closed

| Finding                                                                       | Status                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R16 §3** 🟡 `npm run build` fails for a developer following the quick-start | ✅ **Closed as recommended (option 1).** `.env.example` now states the MOCK\_\* vars are for `npm run dev` only, that `npm run build` runs as production and the guard refuses it, and names both escapes — unset the vars, or use `E2E_BUILD=1`. |
| **R16 §4** 🟢 `lint` has no `--max-warnings`                                  | ✅ **Closed.** Now `eslint --max-warnings 0`, and the unused import in `teaching-hours.test.ts` was removed first so the gate landed green.                                                                                                       |
| **R11 §4.3** 🟢 `EXTENSION_MIME` executable-type note                         | ✅ **Closed.** The comment names the magic-byte cross-check, `nosniff` and the CSP as layered defences, and says the allowlist is the first — "weigh the download-route effect before extending it."                                              |
| **FIND-31** (R9) Blog content should be MDX                                   | ✅ **Closed.** `src/content/blog/*.mdx` with a `[slug]` route.                                                                                                                                                                                    |

### Still open

| Finding                                                    | Severity  | Note                                                                                                                                                           |
| ---------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R10 §9** `design_assets/` — 14 binaries, 19 MB           | 🟢 Low    | **Eighth pass.** Repo pack is now 26.4 MB, of which this is 19 MB. Runtime assets already exist as PNG/SVG elsewhere. Every clone and CI checkout pays for it. |
| **R10 §5.3** Analytics JS-side aggregation, no date window | 🟡 Medium | Partially addressed at R16 (paging fixed a latent truncation bug). `SUM()` still runs in JavaScript; three reads still have no term bound. Year-two item.      |

### Deployment gates — still the entire critical path

B2 (Supabase Pro + backups), B3 (custom SMTP → Resend), B4 (Vercel Pro), B5 (region `bom1`), B6 (preview/production separation), the **B-02** auth dashboard cluster, wiring the **drain + reconcile crons**, publishing the **OAuth consent screen**, and a **real restore drill against an actual Supabase backup** are all still **Not verified**. Nine passes, and none has moved — because none of them is in the repository.

---

## 5. Database

**Chain `0001`–`0095`**, snapshot current, **96 RLS assertions passing**, privilege parity verified at 3428 rows.

New since R16: `0090`–`0091` (attendance/session refinements), `0092` (sub_admin class authority matching its baseline), `0093`–`0094` (several sessions a day, per-session marking), `0095` (hours billing — `billing_period` on receipts and payslips with a `YYYY-MM` format check, threaded through the issue functions). `0f999c8` then made the `0095` function replacement re-runnable, which is the right instinct for a migration that drops and recreates a function.

Capacity is unchanged: **year-1 ≈ 145 MB against the 500 MB Free-tier limit**, `audit_log` capped at 24 months. Database size remains a non-issue; **backups remain the reason to upgrade, and B2 is still unconfirmed.**

RLS assertions have gone 34 → 64 → 67 → 86 → **96** across five passes while the schema grew from 34 to 50+ tables. Coverage is outpacing surface, which is the ratio you want.

---

## 6. Prioritised plan

### Engineering — under an hour total

| #   | Action                                                                                                                 | Finding | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| 1   | Add a `fast-uri` override (or move `@mdx-js/loader` to devDependencies)                                                | §2      | 10 min |
| 2   | **Make the three DB scripts fail loudly on provisioning** — terminate backends, `ON_ERROR_STOP`, check the exit status | §3      | 30 min |
| 3   | Finish the Node 20 → 22 pin (in-flight and uncommitted)                                                                | §0      | —      |
| 4   | `git rm -r design_assets`                                                                                              | §4      | 10 min |

### Environment — the actual critical path

| #   | Action                                                                                   | Finding |
| --- | ---------------------------------------------------------------------------------------- | ------- |
| 5   | **Supabase Pro — backups + PITR on**                                                     | B2      |
| 6   | **Run the real restore drill** against a Supabase backup, including a Drive attachment   | B7      |
| 7   | **Auth email → custom SMTP (Resend)**; receive a real reset                              | B3      |
| 8   | **Vercel Pro**; confirm region `bom1`                                                    | B4/B5   |
| 9   | **Wire the drain + reconcile jobs**; verify one run of each                              | carried |
| 10  | **Set the OAuth consent screen to `In production`**; capture the refresh token           | carried |
| 11  | Preview/production separation                                                            | B6      |
| 12  | **Walk the Supabase auth dashboard**; record every setting                               | B-02    |
| 13  | Smoke-test on deployed infrastructure: sign-in, PDF render, Drive upload/download/delete | —       |

### Later

Push `SUM()` into Postgres; add a term window to the three all-time analytics reads.

---

## 7. Scorecard

| Dimension            |   R16   |   R17   | Justification                                                                                                                                                                                   |
| -------------------- | :-----: | :-----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture         |    9    |  **9**  | Hours-billing and multi-session attendance absorbed cleanly                                                                                                                                     |
| Security             |   10    | **10**  | 96 RLS assertions, privilege parity holding, `0092` aligned sub_admin authority with its stated baseline                                                                                        |
| Maintainability      |   10    | **10**  | Three of my findings closed exactly as specified, one carried since R9                                                                                                                          |
| Performance          |    9    |  **9**  | Bundle flat at 127.4 KB for nine passes                                                                                                                                                         |
| Scalability          |   10    | **10**  | Unchanged                                                                                                                                                                                       |
| Documentation        |    9    | **10**  | +1: the `.env.example` note closes the DX trap I hit last pass                                                                                                                                  |
| Testing              |   10    | **10**  | 1350 unit tests, 96 RLS assertions, 79/79 E2E                                                                                                                                                   |
| Developer Experience |    9    |  **9**  | +1 for the build note, −1 for §3 — a gate that reports 39 fake failures costs more than it looks                                                                                                |
| User Experience      |    9    |  **9**  | Unchanged                                                                                                                                                                                       |
| Code Quality         |   10    |  **9**  | −1: `npm audit` no longer clean (§2)                                                                                                                                                            |
| **Overall**          | **9.6** | **9.6** | Suite up 7% on units, 12% on RLS, 14% on E2E; three findings closed as specified. Offset by a dependency advisory and a harness reliability defect that manufactures convincing false failures. |

---

## 8. Note on method

Two of my three "failures" this pass were not failures. I recorded in R13–R15 that chained gate runs on this machine produce false alarms, and adopted running each gate individually — which held for two passes. This pass the false alarms came from a different place: the harness's own provisioning, not my orchestration.

The rule that saved it is the one I wrote in R14, and it earned its keep twice here: **treat any failure whose message names infrastructure rather than an assertion as suspect until re-run.** The second instance — 39 assertions failing on a real column in a real new migration — did not name infrastructure at all, and I only established it was false by walking the chain by hand and confirming the column exists.

Which is the argument for §3. A guard that fails honestly is worth more than a guard that fails often, and these three scripts currently fail dishonestly: they convert a provisioning error into a schema story. Fixing that is thirty minutes and removes a whole category of wasted diagnosis — for me, and for whoever reads the next red CI run.

---

_Revision 17 performed 2026-09-05 against `feature/cert-ed-academia-app` @ `0f999c8` (chain head `0095`) with nine files uncommitted (§0), on Node v24.13.1 rather than the in-flight pinned 22.x. Each gate was executed individually, and the migration chain was hand-walked with `ON_ERROR_STOP=1` to disprove an apparent schema failure. All probe databases were dropped; no application code was modified — the only file written is this report. Items that could not be verified from the repository — Supabase plan, region, backups, SMTP and auth dashboard settings; Vercel plan; the Google OAuth consent-screen publishing status; whether the drain/reconcile jobs are scheduled; and a restore from a real Supabase backup — are labelled_ **Not verified** _in place._
