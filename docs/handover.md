# Handover — the state of the world

**Last reviewed: 2026-09-29.**

The repository's CI is green and its tests pass, which says the code is consistent with itself. It does not say the running system is finished. This file is the register of what is still open, so someone arriving at a clean clone does not have to infer it.

Keep it current: close an item by deleting its row and, where the fact is durable, writing it into the doc that owns it (`deployment.md`, `operations.md`, `environment.md`). A stale register is worse than none.

## How to read this

Each item says what is wrong or missing, what "done" looks like, and where the detail lives. Nothing here contains a secret — see [accounts-and-access.md](accounts-and-access.md) for who holds what.

---

## Blocking — the live system is degraded until these close

### 1. Production database is behind the migration chain

The chain head is `0122_assignments_fall_due.sql`. Production was last taken to `0118` plus the out-of-band server-function grants. Migrations **0119, 0120, 0121 and 0122** have not been applied there.

**Staging is at the chain head as of 2026-10-12** — `MIGRATIONS_0119_to_0122.sql` was run there, which also re-ran 0119/0120 so the two mentorship function bodies match the chain byte for byte. Production is the remaining half.

**Done looks like:** production at the chain head, and the verification query for each returning all `true`.

**The order of work, decided 2026-10-12:** everything is proven on staging first, then production follows. So a fix that is "done" in this register means done on staging unless it says otherwise, and production is taken through the same steps afterwards.

---

## Not blocking, but unfinished

### 2. Custodial Drive storage — configured, not yet proven

All four `GOOGLE_DRIVE_*` variables were set on 2026-09-30, the app has been redeployed since, and the OAuth consent screen was already **In production** when the refresh token was captured — so the token is long-lived and there is no 7-day expiry waiting.

**One thing remains: nobody has uploaded a file yet.** Until someone has, "configured" and "working" are different claims, and the ways this fails are quiet ones — a wrong folder id, or a token captured while signed in as the wrong Google account, both of which produce a setup that looks healthy while filing student records somewhere nobody intends.

**Done looks like**, in order:

1. Sign in, attach a PDF to a submission or a resource, and confirm the upload completes.
2. Open the academy's Drive folder **as the dedicated academy account** and see the file there, under a date subfolder.
3. Download it back through the app, to prove the streaming read path works and not just the write.
4. Confirm nothing is stuck: no rows sitting in `pending` or `failed`.

```sql
select status, count(*), max(created_at) as latest
from attachments group by status order by status;
```

Expect `active` rows and nothing accumulating in `pending` or `failed`. A stuck `pending` means the two-phase upload never completed; `failed` carries the reason. The `reconcile-attachments` cron sweeps both, and `queue-health` alarms once failures pile up.

### 3. Backups are not configured, and no restore has been tested

[operations.md](operations.md) describes the intent. Neither the scheduled backup nor a restore rehearsal has been done.

**Done looks like:** a daily backup running, and one restore performed end to end into a scratch project, with the date recorded here.

### 4. Guardian consent is hidden behind a flag

`SHOW_GUARDIAN_CONSENT` in `src/app/(prt)/register/RegisterForm.tsx` is `false`, hiding the consent tick while the policy pages were being settled. **The server rule is untouched**, so an account whose date of birth makes it a minor still cannot complete registration without guardian consent — and while the box is hidden, that consent cannot be given. Minors therefore cannot currently register.

Set the flag back to `true` once the policy wording is final. A store submission covering minors forces this decision anyway.

### 5. Policy pages carry unfilled details

The legal entity name and the retention periods are still to be confirmed by the owners. The pages are live and honest about what they say; these are gaps to fill, not drafts to replace.

### 6. Next.js is deliberately a minor behind — revisit by late October 2026

Pinned at **16.3.8**, which is stable and carries every security fix published so far. `latest` is 16.4.0 (6 October), and the project is staying off it on purpose: nothing needs 16.4 features, production is live, and a two-day-old minor is not where a live academy should be.

The reason this is written down rather than left as a judgement: the project sat on **16.3.4 from 31 August to 7 October** and drifted five patch releases behind, so when a critical advisory was disclosed the fix had already been on the registry for over two weeks. Staying a minor behind is fine; forgetting that you are is not, because the next advisory may be fixed only in 16.4.x and then the bump happens under incident pressure.

**Done looks like** either moving to 16.4.x once 16.4.1+ exists and the full gate passes, or a dependency bot (Dependabot or Renovate) raising the PRs so the decision surfaces on its own. The CI gate is strong enough to judge such a PR: typecheck, lint, the unit suite, Playwright, RLS and privilege parity.

Check with `npm outdated next` and `npm audit --omit=dev`. Production dependencies should read zero; the remaining dev-only advisories come from `eslint-config-next@16.0.8`, which has no 16.3.x line and so cannot be cleared without the 16.4 move.

### 7. Smaller open threads

- **Leaked-password protection** is off in Supabase auth settings; it was deliberately deferred.
- **Publishing status of the Google OAuth consent screen** is settled — it is In production, which is what makes the Drive refresh token long-lived.
- **`GOOGLE_SCRIPT_URL`** (the contact-form Apps Script endpoint) is unset.
- **Deploys are owner-triggered.** Pushing to `main` does not release; the owner redeploys.
- **Supabase JWT expiry is still the one-hour default.** Drop it to 15–30 minutes before the mobile apps ship: access tokens on phones live in more places than cookies on a laptop, and the client refreshes silently.
- **Production's `public` schema is not byte-identical to a chain-built one, and never has been.** `PROD-0` drops the stock schema, so what `PROD-1` recreates is owned by `postgres` rather than `pg_database_owner`, and USAGE is granted explicitly to `anon`, `authenticated` and `service_role` instead of being inherited by `PUBLIC`. The net effect is **stricter** than the chain, so it is left alone — but a schema dump compared against the migration chain will show those three lines, and a rehearsal on 2026-10-02 confirmed they are the only differences. Table, column and function privileges match exactly (3450 rows).
- **Web Analytics must be enabled in the Vercel dashboard**, and the **sitemap submitted in Search Console**. The code side of both is done: `@vercel/analytics` and `@vercel/speed-insights` are mounted on the marketing group only, and `sitemap.xml` and `robots.txt` serve correctly on the canonical host. Neither collects or reports anything until those two dashboard steps are taken.

---

## Recently closed

- **Google sign-in** — working as of **2026-09-30**. It had been failing at Supabase's token exchange with Google (`Unable to exchange external code`, `invalid_grant`). Diagnosis on 2026-09-29 verified the client id, the registered redirect URI and the client id/secret pair directly, which left the secret stored in Supabase or a spent authorization code as the remaining candidates. _What finally fixed it is not recorded — worth one line here, because the next person debugging OAuth will come looking._

## Mobile apps

Decided on 2026-09-29 and recorded in [adr/0007](adr/0007-mobile-apps-expo-and-api-v1.md): Expo / React Native for students and tutors, over a versioned `/api/v1` that reuses the existing guards. The preparatory work in this repository has landed. The API layer and the app have not started, and store accounts do not exist yet — the Apple organisation enrolment needs a D-U-N-S number and is the long pole.
