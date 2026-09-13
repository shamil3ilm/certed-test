# Production go-live checklist

Work top to bottom before opening the portal to real users. Each item links to the runbook that explains it. This is a living gate — keep it in sync as the app changes.

## Plan decision - free tier (2026-09-13)

Supabase **Free** and Vercel **Hobby**, decided deliberately. Three items below cannot be
satisfied as written, so they are recorded here with what replaces them rather than left
looking pending. Revisit this section when either plan changes.

**Backups - no automated cover.** Free has neither daily backups nor PITR, and this app is the
system of record for receipts and payslips. Capacity is not the issue (500 MB against ~145 MB
projected at year 1); the backups are. The compensating control is a scheduled `pg_dump` held
somewhere off the project, verified the same way a real backup would be: restore it into a
scratch database and run `PGHOST=... PGDATABASE=<scratch> bash scripts/restore-drill.sh`. That
script does not care where the dump came from. Until that exists, **an incident that loses the
database loses the financial record with it** - the one consequence on this page that no later
fix reaches.

**Crons - use the plan-independent path.** Hobby caps crons at 2 jobs, once daily, and the email
drain needs ~5 minutes. Do not add them to `vercel.json` (a Hobby target rejects the whole
deployment). Schedule them from Postgres instead with `pg_cron` + `pg_net`, which migration
`0058` ships commented at the bottom - same `CRON_SECRET`-guarded routes, no plan requirement.

**PDF routes - verify before relying on them.** The four heavy routes declare
`export const maxDuration = 60` and launch headless Chromium. Hobby's function limits are
lower than Pro's on both duration and memory, so these are the first thing to break under a
real render. Generate one report card on the deployed Hobby project before trusting it; if it
times out or OOMs, that is the plan, not the code.

**Commercial use is a licence question, not a technical one.** Vercel's Hobby terms prohibit
commercial use, and a fee-collecting academy portal is commercial. Free tier is fine while this
is a pre-launch build with no real users or fees; it stops being fine on the day it takes money.

## Integrations deferred - free tier (2026-09-13)

Decided, not forgotten. Each is safe to defer because its absent state is honest rather than
silent - the point worth checking before deferring anything.

**Email (Resend) - fully dormant, nothing accumulates.** `notifications.ts` returns before it
enqueues unless all three of `EMAIL_NOTIFICATIONS_ENABLED=true`, `RESEND_API_KEY` and
`EMAIL_FROM` are set, so with them absent nothing is written to `pending_emails` at all. There
is no queue quietly filling up and no mail being lost - the pipeline simply does not run. Turn
all three on together when it is wanted; until then the drain cron has nothing to drain.

**`NEXT_PUBLIC_APP_URL` - couple it to Resend.** Its only job is absolutising links inside
emails, so it is moot while email is off and required the moment it is on. Set it in the same
change, or the first mail out has relative links in it.

**`SENTRY_DSN` - you lose alerting, not visibility.** `logError` writes `console.error` first
and forwards to Sentry second, and Vercel captures stderr into its platform logs. So errors
stay diagnosable without a DSN; what is missing is aggregation, grouping and being told. Sentry
has a free tier, so this is cheap to close whenever it is wanted rather than a plan decision.

**`NEXT_PUBLIC_SENTRY_DSN` - absence is a small win.** Unset, the ~145 KB browser SDK is folded
out of the client bundle entirely.

**`GOOGLE_SCRIPT_URL` - REQUIRED, not deferred.** The marketing site is live, so the contact
form is reachable and this backs it. Unset, the form answers a deliberate 503 - "temporarily
unavailable, please email us directly" - and logs the cause; it never accepts a submission and
drops it. That is an honest failure, but it is still a dead contact form on a public site.
(It would only be moot on a `PORTAL_ONLY=1` deploy, where the form is unreachable.)

## Code and CI

_Verified 2026-09-13 at `48ab541`: typecheck/lint/format clean, 1654 unit tests across 199 files,
coverage 75.27/65.99/75.03/78.86, 85 Playwright specs, clean-`.next` build, snapshot at 0106,
`npm audit --omit=dev` 0 vulnerabilities, first-load JS 127.9 KB against a 133 KB budget. Re-run
before the actual deploy - this section is the only one that goes stale on its own._

- [x] `npm run typecheck`, `npm run lint`, `npm run format:check` clean
- [x] `npm run test:coverage` passes (ratchet green)
- [x] `npm run build` succeeds from a clean `.next`
- [x] `npm run check:snapshot` current (rebuild snapshot at the chain head)
- [x] `npx playwright test` passes
- [x] `npm audit --omit=dev` reports 0 high
      <br>Note: `fast-uri` reaches the PRODUCTION tree via `@next/mdx` -> `@mdx-js/loader`
      -> `webpack` -> `schema-utils` -> `ajv`, and it cannot be removed by moving the loader
      to devDependencies: `@next/mdx` declares it an OPTIONAL PEER, and npm installs a
      satisfied optional peer of a production dependency. Verified with a real
      `npm ci --omit=dev` - the loader, webpack and fast-uri are all still present. The
      `overrides` entry pinning `fast-uri` is therefore the fix, not a workaround.
- [x] `npm run check:bundle` within budget

## Database (Supabase)

- [ ] Project is in the **same region** as Vercel (`bom1`) — [deployment.md](deployment.md)
- [ ] Full migration chain applied; head matches `supabase/rebuild/0000_full_rebuild.sql`
- [ ] RLS on for every table; policies match [rls-policy-inventory.md](rls-policy-inventory.md)
- [ ] **Daily backups + PITR enabled**, and a **restore drill performed** — [operations.md](operations.md#backups-and-restore)
      <br>**Not available on Free** — see [Plan decision](#plan-decision---free-tier-2026-09-13). Stays unticked: the compensating `pg_dump` is not a substitute for having been restored.
- [ ] **`pg_cron` enabled BEFORE the chain is applied** — `create extension if not exists pg_cron;`
      <br>The four migrations that schedule retention (`0051`, `0058`, `0059`, `0101`) wrap
      `cron.schedule` in a guard that skips silently without it and still reports success. Apply
      the chain first and you get a database with no retention while the migration log looks
      clean. If it is already applied, enable the extension and re-run those four.
- [ ] Retention jobs present: `select jobname, schedule from cron.job;` — expect **four**, all active

## Environment and secrets

- [ ] All required vars set in Vercel **Production** — [environment.md](environment.md)
- [ ] `NEXT_PUBLIC_*` vars are **not** marked Sensitive
- [ ] Server secrets (`SUPABASE_SECRET_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `GOOGLE_DRIVE_*`, `SENTRY_DSN`) marked Sensitive
- [ ] **No mock-only vars in Production** — `MOCK_MODE`, `NEXT_PUBLIC_MOCK_MODE`, `ALLOW_MOCK_AUTH`, `MOCK_PASSWORD`, `MOCK_CHROME_PATH` must be **absent**. They drive the in-memory mock auth/DB bypass (plaintext passwords, unsigned cookie). Enforced: the build fails and the app refuses to boot if any is set with `VERCEL_ENV=production` (`assertNoMockConfigInProduction`).
- [ ] Separate Supabase project + Drive folder for Preview vs Production
- [ ] No secrets in git; rotation runbook current — [security-operations.md](security-operations.md)

## Dual-host - marketing site is live (2026-09-13)

The portal and the marketing site are served from one deployment, split by host: `resolveHost`
routes on `host.startsWith('app.')` alone, so routing itself needs no configuration. Three
variables decide whether that split behaves, and one of them is dangerous to copy from staging.

- [ ] **`PORTAL_ONLY` is ABSENT in Production.** It is set in staging, correctly - that is a
      single `*.vercel.app` host with no marketing site. Carried into production it does two
      things: forces every request to the portal, so the marketing pages never serve, and makes
      `robots.ts` return `disallow: /`, telling search engines not to crawl the live site at
      all. Do not copy the staging variable set over wholesale.
- [ ] **`APP_HOSTNAME` and `MARKETING_HOSTNAME` both set** (e.g. `app.certedacademia.com` /
      `certedacademia.com`). They drive only the cross-host redirects - a marketing path
      requested on the app host, or vice versa. Unset, `crossHostUrl` returns null and the page
      is served IN PLACE rather than redirected to `https://undefined/...`: a deliberate
      degradation, so the site keeps working while the misconfiguration stays visible. With
      marketing live, set both, or portal and marketing each answer on the other's host.
- [ ] **`GOOGLE_SCRIPT_URL` set** - the contact form is public now. `/api/contact` is
      deliberately served on the marketing host and excluded from cross-host redirects, so a
      POST is never stripped to a GET.

## Platform

- [ ] Vercel plan is **Pro** (Hobby prohibits commercial use)
      <br>Deliberately on Hobby — see [Plan decision](#plan-decision---free-tier-2026-09-13). A licence question the day this takes money.
- [ ] PDF routes (`/api/**/pdf`) given extra function memory; one report-card render load-tested
      <br>Hobby limits are below the declared `maxDuration = 60` — render one on the deployed project before trusting it. See [Plan decision](#plan-decision---free-tier-2026-09-13).
- [ ] Rollback procedure known (Vercel instant promote) — [operations.md](operations.md#incident-response)

## Integrations

- [ ] **Public sign-ups disabled** in Supabase Auth (Authentication → Providers → Email → _Allow new users to sign up_ OFF). The app never self-signs-up — registration binds to an admin-created allowlist profile + setup code — so leaving Supabase signup on only lets someone forge orphan auth users directly against the API. Turn it off; the service role still creates users for the invite flow.
- [ ] Auth email switched to **custom SMTP → Resend** (not built-in SMTP) — [deployment.md](deployment.md#2-auth-email--custom-smtp-do-this-before-inviting-anyone)
- [ ] Email **drain** cron wired (`/api/cron/drain-emails`), else queued mail never sends
      <br>On Hobby wire it from Postgres (`pg_cron` + `pg_net`, migration `0058`), not `vercel.json`. Nothing to drain until the three email vars are set - see [Integrations deferred](#integrations-deferred---free-tier-2026-09-13).
- [ ] Attachment **reconcile** cron wired (`/api/cron/reconcile-attachments`) if Drive storage is on
- [ ] Keepalive cron present (`vercel.json`)
- [ ] Sentry DSNs set (server + browser); a test event appears in Sentry
      <br>Deferred - errors still reach Vercel's platform logs via `console.error`. See [Integrations deferred](#integrations-deferred---free-tier-2026-09-13).

## First run

- [ ] Allowlist seeded — admin + teacher + student — via `scripts/seed-production-allowlist.mjs` (reads `PRODUCTION_SEED_ADMIN/TEACHER/STUDENT_EMAIL`, or pass the three emails as positional args)
- [ ] Real sign-in works on the production host (not a local build)
- [ ] Smoke test: grade a submission, issue + render a receipt, upload + download a file

## Post-launch watch

- [ ] Dashboard load time acceptable under a few concurrent mentors (region check)
- [ ] Sentry quiet of unexpected errors after first real traffic
- [ ] Backups confirmed running after 24h
