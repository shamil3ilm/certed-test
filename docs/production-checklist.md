# Production go-live checklist

Work top to bottom before opening the portal to real users. Each item links to the runbook that explains it. This is a living gate — keep it in sync as the app changes.

## Code and CI

- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` clean
- [ ] `npm run test:coverage` passes (ratchet green)
- [ ] `npm run build` succeeds from a clean `.next`
- [ ] `npm run check:snapshot` current (rebuild snapshot at the chain head)
- [ ] `npx playwright test` passes
- [ ] `npm audit --omit=dev` reports 0 high
- [ ] `npm run check:bundle` within budget

## Database (Supabase)

- [ ] Project is in the **same region** as Vercel (`bom1`) — [deployment.md](deployment.md)
- [ ] Full migration chain applied; head matches `supabase/rebuild/0000_full_rebuild.sql`
- [ ] RLS on for every table; policies match [rls-policy-inventory.md](rls-policy-inventory.md)
- [ ] **Daily backups + PITR enabled**, and a **restore drill performed** — [operations.md](operations.md#backups-and-restore)
- [ ] Retention jobs present: `select jobname, schedule from cron.job;`

## Environment and secrets

- [ ] All required vars set in Vercel **Production** — [environment.md](environment.md)
- [ ] `NEXT_PUBLIC_*` vars are **not** marked Sensitive
- [ ] Server secrets (`SUPABASE_SECRET_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `GOOGLE_DRIVE_*`, `SENTRY_DSN`) marked Sensitive
- [ ] Separate Supabase project + Drive folder for Preview vs Production
- [ ] No secrets in git; rotation runbook current — [security-operations.md](security-operations.md)

## Platform

- [ ] Vercel plan is **Pro** (Hobby prohibits commercial use)
- [ ] PDF routes (`/api/**/pdf`) given extra function memory; one report-card render load-tested
- [ ] Rollback procedure known (Vercel instant promote) — [operations.md](operations.md#incident-response)

## Integrations

- [ ] Auth email switched to **custom SMTP → Resend** (not built-in SMTP) — [deployment.md](deployment.md#2-auth-email--custom-smtp-do-this-before-inviting-anyone)
- [ ] Email **drain** cron wired (`/api/cron/drain-emails`), else queued mail never sends
- [ ] Attachment **reconcile** cron wired (`/api/cron/reconcile-attachments`) if Drive storage is on
- [ ] Keepalive cron present (`vercel.json`)
- [ ] Sentry DSNs set (server + browser); a test event appears in Sentry

## First run

- [ ] First admin seeded (`SEED_ADMIN_EMAIL`)
- [ ] Real sign-in works on the production host (not a local build)
- [ ] Smoke test: grade a submission, issue + render a receipt, upload + download a file

## Post-launch watch

- [ ] Dashboard load time acceptable under a few concurrent mentors (region check)
- [ ] Sentry quiet of unexpected errors after first real traffic
- [ ] Backups confirmed running after 24h
