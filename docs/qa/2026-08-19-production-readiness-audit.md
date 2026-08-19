# Cert-Ed Academia — Production Readiness Audit

- **Date:** 2026-08-19 · **Revision 12** (production-readiness series; distinct from the `2026-08-03-architecture-audit.md` living document)
- **Repository:** `c:\laragon\www\wed_cert` (package `cert-ed-academia`)
- **Branch:** `feature/cert-ed-academia-app` @ `6adab47`, chain head `0064`
- **Method:** static analysis plus live execution of `typecheck`, `lint`, `format:check`, `test:coverage`, a clean `rm -rf .next && build`, `check:bundle`, `check:snapshot`, `npm audit --omit=dev`, `scripts/test-rls.sh` against real Postgres 18, and the full Playwright suite (twice — see §1.1)
- **Scope:** production-readiness for an initial **~100-user** deployment
- **Supersedes:** [Revision 11](./2026-08-13-production-readiness-audit.md)

> **Note on tree state.** A parallel session added `supabase/migrations/0065_profile_self_service_grants.sql` while this audit was running. All measurements below were taken at chain head **`0064`**; `0065` is untracked and was not audited beyond reading it (§4.4).

---

## 0. Verdict

**No product defect blocks production. Three guards are red, all for the same reason: the last feature batch shipped without running them.**

R11's critical defect — the production build shipping a broken `/messages/[id]` — is **closed, and closed better than I recommended.** I offered a one-line fix _or_ a build-time guard; both were done. The deep import is in place with a comment explaining exactly why not to "simplify" it back, and `scripts/check-client-manifest.mjs` now fails the build if that class of omission ever recurs on any page. It reported clean across 26 pages this run.

Since then, four migrations and six feature commits landed: subjects, per-class subject, richer person details, exam calendar events, assignment attachments, an org-settings screen, and a dead-column drop. The code quality is consistent with the rest of the project. **What did not happen is running the suite afterwards.**

Three gates are consequently red, and I want to be precise that **none of them is a bug**:

1. `negative-access.pw.ts` says a sub-admin must not reach `/classroom`. A sub-admin now can — because `649d5db` **deliberately** widened the persona, with a written rationale. The product is right; the access matrix is stale.
2. `journeys.pw.ts` adds a user by filling three fields. The form now has **required** `country` and `class_level`. The product is right; the spec is stale.
3. The rebuild snapshot sits at `0060` against a chain head of `0064`.

That is the finding of this pass, and it is a process one: **a privilege widening and two schema-visible changes shipped without the guards that exist to notice them.** The negative-access matrix is specifically the control that catches unintended privilege growth. When it is red for a legitimate reason and left that way, it stops being able to tell you about an illegitimate one.

Two genuinely new risks are in §4: an **OAuth consent-screen trap that will break attachments about seven days after go-live**, and the still-missing queue alarm — now more important, because committing the cron schedules was correctly rejected (§3.2).

Overall project health: **9.0 / 10** (was 9.1). Engineering quality is unchanged and high; the dip is guard discipline.

---

## 1. Verification results

| Gate                            | R11    | R12 | Note                                              |
| ------------------------------- | ------ | --- | ------------------------------------------------- |
| `npm run typecheck`             | ✅     | ✅  |                                                   |
| `npm run lint`                  | ✅     | ✅  |                                                   |
| `npm run format:check`          | ✅     | ✅  |                                                   |
| `npm run test:coverage`         | ✅ 924 | ✅  | **953 passed / 123 files** (+29)                  |
| `npm run build` (clean `.next`) | ✅     | ✅  | **+ `check-client-manifest`: OK across 26 pages** |
| `npm run check:bundle`          | ✅     | ✅  | 127.4 / 145 KB — flat for six passes              |
| `npm run check:snapshot`        | ✅     | ❌  | **stale: snapshot `0060`, chain `0064`**          |
| `scripts/test-rls.sh`           | ✅ 34  | ✅  | **34 passed, 0 failed** — but see §4.3            |
| `npm audit --omit=dev`          | ✅ 0   | ✅  | 0                                                 |
| `npx playwright test`           | ❌ 3   | ❌  | **2 failed / 63 passed** — both stale specs (§2)  |

### 1.1 A correction about my own measurement

My first Playwright run this pass reported **28 failures**, and an earlier partial run over 100. Both were **my tooling, not the application.**

Playwright's config sets `reuseExistingServer: !process.env.CI`. A server from earlier in this session was still listening on `:3100`, so Playwright reused it instead of building — while I had separately rebuilt `.next` underneath it. The running server served HTML referencing chunk `9845-3843e6bb…`, but disk held `9845-22d8e97d…`:

```
GET /_next/static/chunks/9845-3843e6bbcf9c48e4.js  →  500, Content-Type: text/plain
Refused to execute script … MIME type ('text/plain') is not executable
```

No JavaScript loaded, so nothing hydrated and Playwright saw elements "detached from the DOM" on the login form of every spec. **24 of those 28 failures were `ERR_CONNECTION_REFUSED` cascade.** After killing the stale server, the suite ran clean in **4.7 minutes: 2 failed, 63 passed.**

I am recording this because I nearly reported a catastrophic regression that did not exist, and because the same trap is live for anyone on this repo: **a leftover `:3100` server silently converts `npx playwright test` into a test of an old build.** Worth a line in the E2E docs, or a `reuseExistingServer: false` if local runs should always be authoritative.

---

## 2. The two E2E failures

### 2.1 🟠 HIGH — the access matrix no longer matches the access model

```
negative -- subadmin@mock.test is bounced from 6 unauthorized routes
  subadmin@mock.test must NOT reach /classroom
  Expected: /\/dashboard(\?|$|#)/     Received: "http://localhost:3100/classroom"
```

**The product is correct.** `649d5db` rewrote the sub-admin persona deliberately, and said so:

```ts
// An operational admin: manages users, classes (lifecycle + teaching staff +
// content + timetable + grading, academy-wide) and mentorships. Deliberately
// WITHOUT the admin-tier structural power, the finance ledger, or the audit
// history - those stay admin-only (grantable per user via an audited override).
sub_admin: new Set<Capability>([ 'viewDashboard', 'viewMessages', 'viewClasses', … ])
```

`viewClasses` is now a sub-admin capability, so `/classroom` is authorized. `docs/persona-model.md` was updated in the same commit. `tests/unit/capabilities.test.ts` and `nav-order.test.ts` were updated. **`tests/e2e/negative-access.pw.ts` was not.**

**Why this rates High even though nothing is broken.** This is a _privilege widening_, and the negative-access matrix is the one guard whose job is to notice privilege widening. Leaving it red for a legitimate reason is how a guard stops being trusted — and this is the third time an access-matrix assertion has gone stale against a deliberate change (R9's NEW-21 on `/grades`, R10's seed drift, now this).

**Fix:** move `/classroom` from the sub-admin's unauthorized list to its authorized list — converting a now-wrong negative control into a correct positive one. Then add the routes the widened persona must _still_ be refused (`/admin/finance`, `/admin/history`, the admin-tier surfaces the comment calls out), because those are the assertions that now carry the security value.

**Stronger recommendation:** make the E2E access matrix derive from `PERSONA_CAPABILITIES` rather than restating it by hand, or add a unit test asserting the two agree. A hand-maintained duplicate of the authorization model will keep drifting.

### 2.2 🟢 LOW — the add-user journey fills a form that has since grown required fields

```
ADMIN -- create class -> enrol -> announce -> issue receipt -> add user
  expect(getByText('e2e-newbie@mock.test')).toBeVisible()  →  element(s) not found
```

The spec fills `email`, `full_name`, `role`. `AddUserForm.tsx` now also requires `class_level` and **`country`** for a student (from the `0064` person-details work), so submission never succeeds and the user is never created.

**Product correct, spec stale.** Add the two fields to the spec.

---

## 3. R11 findings — status

### 3.1 Closed

| R11 finding                                                            | Status                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§2** 🔴 `--webpack` drops `MessageComposer` from the client manifest | ✅ **Closed twice over.** `page.tsx` deep-imports `Card` from `@/lib/ui/layout` with a "do NOT simplify this back" comment, **and** `scripts/check-client-manifest.mjs` runs post-build and fails on any recurrence. This is the durable fix I hoped for, not just the one-liner. |
| **§4.1** Crons absent from `vercel.json`                               | ✅ **Correctly rejected — my recommendation was wrong.** See §3.2.                                                                                                                                                                                                                |
| **R10 §7.2** Drive credential model undecided                          | ✅ **Decided:** dedicated academy Drive account + refresh token, with `scripts/get-drive-refresh-token.mjs` as a one-time helper. The right call absent Google Workspace.                                                                                                         |
| **R10 §4.1** Redundant/dead columns                                    | ✅ `0063` drops `resources.topic`, `org_settings.signature_mode`, `org_settings.default_currency`. **I verified all three are unreferenced** in `src/` and by no policy, index, or trigger. Safe.                                                                                 |
| Doc-link rot                                                           | ✅ New `scripts/check-doc-links.sh`, wired into CI                                                                                                                                                                                                                                |

### 3.2 A recommendation of mine that was right to reject

R11 §4.1 told you to commit the drain and reconcile crons to `vercel.json`. `1094dbd` reverted that, with a better reason than I had:

> _The 5-minute drain-emails schedule is sub-daily and, with reconcile-attachments, put three crons in vercel.json — which exceeds the Vercel Hobby limit (2 crons, once-daily) and failed the deployment on the Hobby test fork._

That is a real constraint I did not check, and keeping the repo deployable on any plan is the right trade. The jobs are wired per-environment on the Pro project or via `pg_cron`, per `deployment.md`. **My advice was wrong; the correction stands.**

But the underlying exposure is unchanged and now rests entirely on a deploy-time human step. That makes §4.2 more important, not less.

### 3.3 Still open

| Finding                                                                | Severity  | Note                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§4.2** No alarm on queue depth or failed attachments                 | 🟠 High   | Unimplemented, and now the _only_ backstop against the drain cron never being wired. If nobody schedules it, every notification email queues silently forever.                                    |
| **NEW-28** `.githooks/pre-push` is mode `100644`                       | 🟡 Medium | Still `100644`. The hook body is correct and `core.hooksPath` is set, but Git silently skips a non-executable hook on macOS/Linux. One command: `git update-index --chmod=+x .githooks/pre-push`. |
| **R10 §5.3** Unbounded analytics reads                                 | 🟡 Medium | Unchanged — `sumResourceDownloads()` still fetches every active resource row to sum in JS; the attendance/session reads still have no date bound.                                                 |
| **R11 §4.3** `EXTENSION_MIME` has no "browser-executable type" warning | 🟢 Low    | Unchanged. `DANGEROUS_INNER` covers masked inner extensions, which is a different guard.                                                                                                          |
| **R10 §9** `design_assets/` — 14 binaries, 19 MB                       | 🟢 Low    | Still tracked, still ~80% of the repo                                                                                                                                                             |
| **FIND-29** No dark mode                                               | 🟡 Medium | Thirteenth pass                                                                                                                                                                                   |
| **M5** Ratchet bundle budget 145 → 133                                 | 🟢 Low    | The script prints the recommendation every run                                                                                                                                                    |

### 3.4 Environment gates — unchanged, still unverifiable

B2 (Supabase Pro + backups), B3 (custom SMTP → Resend), B4 (Vercel Pro), B5 (region = `bom1`), B6 (preview/production separation), B7 (restore drill) all remain **Not verified** — they live in dashboards, not the repository. All six are documented in `production-checklist.md`, `deployment.md`, and `operations.md`. They are still go-live gates.

---

## 4. New findings

### 4.1 🟠 HIGH — the Drive refresh token will expire ~7 days after go-live unless the OAuth app is published

The chosen credential model depends on a long-lived `GOOGLE_DRIVE_REFRESH_TOKEN`. **Google only issues long-lived refresh tokens to OAuth clients whose consent screen is in the `In production` publishing status.** While an app sits in `Testing` — the default for a newly created client — refresh tokens for external users expire after **7 days**.

`scripts/get-drive-refresh-token.mjs` documents the prerequisites carefully — enable the Drive API, create a Web application client, register the redirect URI — but says nothing about publishing status. Neither does `deployment.md §6`, whose step 2 is just "run the consent flow once by hand and capture the refresh token".

**The failure mode is nasty:** everything works for a week, then every upload and every download fails at once, roughly when the academy has started trusting it. The error surfaces as:

```ts
if (!res.ok) throw new Error(`Drive token exchange failed: ${res.status}`)
```

— a bare `400`. Google's response body says `"error": "invalid_grant"`, which is the entire diagnosis, and it is discarded.

**Two fixes, both small:**

1. **Document it.** Add to `deployment.md §6`: set the OAuth consent screen to **In production** (or add the academy account as a test user _and_ accept weekly re-consent — not viable) before capturing the token. Add "Attachment upload/download suddenly fails for everyone" → "refresh token expired; OAuth app still in Testing" to `operations.md`'s triage table.
2. **Include the reason in the error.** Parse the body and append `error`/`error_description` to the thrown message, so the log says `invalid_grant` instead of `400`. This is the same "make the failure self-diagnosing" instinct as the existing `rateLimitShared:rpc-missing` log.

**Not verified:** the publishing status of your OAuth client — I cannot see the Google Cloud console. If it is already `In production`, this is documentation only.

### 4.2 🟡 MEDIUM — new personal data of minors, with no retention or protection note

`0064` adds ten columns to `profiles`, six of them personal data about people who are mostly children: `date_of_birth`, `address`, `phone`, `guardian_name`, `guardian_phone`, `gender`.

**The access controls are correct, and I checked them specifically:**

- `profiles` RLS remains `auth_user_id = auth.uid() or is_active_admin()` — no peer reads.
- The directory/list queries select `id, auth_user_id, email, full_name, role, status, class_level` — **no PII**.
- Only `selectProfileDetailsById` selects the sensitive columns, and it has exactly two callers: `/settings` (self) and `/admin/users/[id]`, gated by `requireCapability('manageUsers')`.
- `0065` (parallel session, §4.4) grants self-service `UPDATE` on only the softer columns, deliberately withholding `class_level`, `country`, `guardian_*`, `joined_on` from self-edit.

So this is **not** a defect. It is a change in what the system _is_: a database holding minors' home addresses and guardian contacts now has materially different obligations from one holding names and class levels — under India's DPDP Act, and under GDPR if any student is in the EU/UK.

**Recommendation:** add a short data-protection section to `security-operations.md` covering what personal data is held, the lawful basis, who can read it (the three call sites above), how long it is kept after a student leaves, and how a deletion request is honoured. This also sharpens B2 — backups now contain this data, so backup retention _is_ personal-data retention.

**One concrete gap:** there is no retention or erasure path for `profiles`. `audit_log` gained a 24-month purge in `0059` and `notifications` in `0051`, but a departed student's DOB and address persist indefinitely.

### 4.3 🟡 MEDIUM — the newest schema and features have no test coverage of their own

The RLS harness still reports exactly **34 assertions**, unchanged across `0057`–`0064`. In that window the schema gained:

- `subjects` — a new table with a `subjects_read` policy (`current_status() = 'active'`) and **zero assertions** (`grep subjects scripts/test-rls.sh` → 0)
- `attachments.assignment_id` — a fourth owner branch in `attachments_read`, **unasserted**

I checked the new policy body by hand, and it is right: the assignment branch mirrors `assignments_read` **exactly** — `is_active_admin() OR (is_enrolled(class_id) AND status='active') OR teaches_class(class_id)`. That is a faithful mirror, and notably it avoids the drift I had to correct in my own `0057` draft at R10.

But "I read it and it looked right" is what the harness exists to replace. Same story in unit tests: `src/lib/services/subjects.ts` has no dedicated test file, and neither do the profile-details flows. Coverage stayed green only because the ratchet measures the whole codebase.

**Recommendation:** an assertion per new policy branch is roughly three lines in `test-rls.sh`. Add one proving a student cannot read another student's assignment attachment, and one for `subjects`.

### 4.4 ℹ️ INFORMATIONAL — `0065` is uncommitted, and the snapshot is now two steps behind

A parallel session added `supabase/migrations/0065_profile_self_service_grants.sql` during this audit. It is a well-reasoned migration — `0033` tightened column-level `UPDATE` on `profiles` to `full_name` only, so the new self-service settings page was 500ing at the GRANT layer, and `0065` grants exactly the self-serviceable columns while deliberately withholding the admin-owned ones.

Two notes: it is **untracked**, and the rebuild snapshot (`0060`) is now four migrations behind the tracked chain and five behind the working tree. The pre-push hook will catch this on push — assuming the pusher is on Windows (§3.3, NEW-28).

---

## 5. Database

**37 tables, 64 indexes, 115 policies**, chain `0001`–`0064` (`0065` untracked), 34 RLS assertions passing against real Postgres 18.

The R10/R11 capacity model holds. The new tables and columns are small:

- `subjects` — tens of rows
- `classes.subject_id` — one uuid per class
- ten `profiles` columns — ~200 bytes × 100 rows ≈ 20 KB
- `attachments.assignment_id` — one nullable uuid

**Year-1 projection remains ≈ 145 MB against the 500 MB Free-tier limit**, with `audit_log` now capped at 24 months (`0059`) so growth is bounded rather than open-ended. Database size is still not a reason to upgrade; **backups still are.**

`0063`'s column drops are the right instinct — removing dead schema rather than carrying it — and I verified they were genuinely dead before recommending nothing further.

---

## 6. Prioritised plan

### Before production

| #   | Action                                                                                                            | Finding | Effort |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| 1   | Update `negative-access.pw.ts` for the widened sub-admin; add the admin-only routes it must still be refused      | §2.1    | 30 min |
| 2   | Add `country` + `class_level` to the add-user journey spec                                                        | §2.2    | 10 min |
| 3   | Regenerate the rebuild snapshot to the chain head                                                                 | §1      | 10 min |
| 4   | **Set the Google OAuth consent screen to `In production`** and re-capture the refresh token                       | §4.1    | 15 min |
| 5   | Surface `invalid_grant` in the Drive token-exchange error                                                         | §4.1    | 10 min |
| 6   | Queue-depth + failed-attachment alarm in the keepalive cron                                                       | §3.3    | 30 min |
| 7   | **Wire the drain + reconcile jobs** on the production project (Pro cron or `pg_cron`), and verify one run of each | §3.2    | 30 min |
| 8   | `git update-index --chmod=+x .githooks/pre-push`                                                                  | §3.3    | 1 min  |
| 9   | RLS assertions for `subjects` and the assignment-attachment branch                                                | §4.3    | 30 min |
| 10  | **Supabase Pro — backups + PITR**, then perform the restore drill                                                 | B2/B7   | 2 h    |
| 11  | **Auth email → custom SMTP (Resend)**; send yourself a real reset                                                 | B3      | 30 min |
| 12  | **Vercel Pro**; verify region is `bom1`                                                                           | B4/B5   | 30 min |
| 13  | Preview/production separation (Supabase project + Drive folder)                                                   | B6      | 2 h    |
| 14  | Smoke-test a PDF render and a full Drive upload/download/delete on deployed infrastructure                        | —       | 1 h    |

### Soon after

| #   | Action                                                                                 | Finding |
| --- | -------------------------------------------------------------------------------------- | ------- |
| 15  | Derive the E2E access matrix from `PERSONA_CAPABILITIES`, or unit-test that they agree | §2.1    |
| 16  | Data-protection note + a retention/erasure path for `profiles`                         | §4.2    |
| 17  | Set `reuseExistingServer: false`, or document the stale-server trap                    | §1.1    |
| 18  | Unit tests for `subjects` and the profile-details flows                                | §4.3    |
| 19  | Bound the analytics reads; push the download sum into SQL                              | §3.3    |
| 20  | `git rm -r design_assets`                                                              | §3.3    |
| 21  | Dark mode, or drop the dark `themeColor` (thirteenth pass)                             | FIND-29 |

---

## 7. Scorecard

| Dimension            |   R11   |   R12   | Justification                                                                                                                                                                                                                       |
| -------------------- | :-----: | :-----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture         |    9    |  **9**  | Four migrations and six features absorbed without straining the layering. −1: a page still imports `src/lib/data` directly (`admin/users/[id]`)                                                                                     |
| Security             |    9    |  **9**  | New PII correctly gated at every one of its three read paths; `0065` withholds admin-owned columns from self-edit. −1 for §4.1 and unverified B2/B3/B6                                                                              |
| Maintainability      |    9    |  **9**  | The manifest guard is exemplary; comments explain what not to "simplify"                                                                                                                                                            |
| Performance          |    9    |  **9**  | Bundle flat at 127.4 KB; no new hot paths                                                                                                                                                                                           |
| Scalability          |    9    |  **9**  | `audit_log` bounded; still no alarm on the queue                                                                                                                                                                                    |
| Documentation        |   10    | **10**  | Doc-link checking now mechanical                                                                                                                                                                                                    |
| Testing              |    9    |  **7**  | −2: a privilege widening shipped without updating the access matrix, and two schema changes landed with no RLS assertions                                                                                                           |
| Developer Experience |    9    |  **9**  | Post-build manifest guard, doc-link guard. −1: pre-push hook still inert off Windows                                                                                                                                                |
| User Experience      |    8    |  **9**  | +1: `/messages/[id]` fixed; subjects, exam events, richer profiles all shipped                                                                                                                                                      |
| Code Quality         |   10    | **10**  | All static gates green; dead columns removed rather than carried                                                                                                                                                                    |
| **Overall**          | **9.1** | **9.0** | R11's critical defect closed with both the fix and a durable guard. Down only on guard discipline: three gates red because a feature batch shipped without running them, one of which is the control that watches privilege growth. |

---

## 8. What I got wrong this pass

- **I nearly reported a catastrophic regression that did not exist.** My first two Playwright runs showed 28 and 100+ failures, including login itself. The cause was a stale `:3100` server that Playwright reused while I rebuilt `.next` underneath it (§1.1). The clean run was 2 failures. Rule followed, eventually: rule out your own tooling before diagnosing the application.
- **My R11 §4.1 recommendation was wrong.** Committing three crons to `vercel.json` breaks deployment on Vercel Hobby (2 crons, daily only). I did not check the plan limits before recommending it; `1094dbd` corrected it properly (§3.2).
- **I briefly treated the mass login failures as a possible nonce/CSP hydration regression** before checking whether any login-related file had changed since the last green run. Nothing had — which should have been my first check, not my third.

---

_Revision 12 performed 2026-08-19 against `feature/cert-ed-academia-app` @ `6adab47` (chain head `0064`), with a clean rebuild, the RLS harness against real Postgres 18, and two Playwright runs (the first invalidated by a stale reused server). Items that could not be verified from the repository — Supabase plan, region, backups and SMTP; Vercel plan; the Google OAuth consent-screen publishing status; and whether the drain/reconcile jobs are scheduled on the production project — are labelled_ **Not verified** _in place. No application code was modified; the only files written are this report._
