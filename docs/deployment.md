# Production deployment

How to stand up a production deployment from scratch. For day-2 operations (backups, monitoring, incidents) see [operations.md](operations.md); for every variable see [environment.md](environment.md).

## Platform choices (and why)

- **Vercel Pro** ($20/mo). Hobby prohibits commercial use, and a fee-collecting academy portal is commercial. Vercel is the reference host for this stack (Next 16 App Router, RSC, Server Actions, `outputFileTracingIncludes`, per-route `maxDuration`, `vercel.json` crons).
- **Supabase Pro** (~$25/mo) — **for the backups, not the capacity.** The 500 MB Free limit is genuinely fine (~145 MB projected at year 1), but this app is the system of record for receipts and payslips; daily backups + PITR are the minimum standard of care.

## 1. Provision Supabase

1. Create the project **in the same region as Vercel** — `vercel.json` pins `bom1` (Mumbai). A cross-region mismatch multiplies every query round-trip; the mentor dashboard is sensitive to it. This is load-bearing, not a tuning detail.
2. Apply the migration chain. The numbered files in `supabase/migrations/` are the source of truth (see [../supabase/README.md](../supabase/README.md)); the delivered `.sql` bundles in the maintainer's Documents folder are the same content, ready for the Supabase SQL editor. Run them in order; the head is the highest-numbered file.
3. Confirm RLS is on for every table and the policy set matches [rls-policy-inventory.md](rls-policy-inventory.md).
4. Enable **daily backups + PITR** (Pro). Then do a restore drill — see [operations.md](operations.md#backups-and-restore).

## 2. Auth email — custom SMTP (do this before inviting anyone)

Supabase's built-in SMTP is rate-limited to a handful of mails/hour and is documented as non-production; at 100 users password resets will silently fail. In Supabase Auth → SMTP settings, point custom SMTP at **Resend** (already a dependency, with a verified sender). Free, ~30 minutes, and fixes deliverability too.

## 3. Configure Vercel

1. Set all environment variables per [environment.md](environment.md), in the **Production** environment. Keep `NEXT_PUBLIC_*` vars **not** marked Sensitive.
2. Use a **separate Supabase project and Drive folder** for the Preview environment so preview builds never touch production data.
3. Raise function memory on the four PDF routes (`/api/**/pdf`) — they launch headless Chromium (~512 MB+ resident). Load-test one report-card render.
4. First deploy: build must be a **fresh (no-cache)** build so `NEXT_PUBLIC_*` values inline correctly.

## 4. Seed the allowlist

Seed the founding admin, teacher, and student allowlist rows with `scripts/seed-production-allowlist.mjs` (reads `PRODUCTION_SEED_ADMIN_EMAIL` / `PRODUCTION_SEED_TEACHER_EMAIL` / `PRODUCTION_SEED_STUDENT_EMAIL`, or pass the three emails as positional args). This is a one-time bootstrap; each user's auth identity binds to their allowlist row on first sign-in, and all later personas are managed in-app.

## 5. Cron jobs

`vercel.json` commits only the **keepalive** ping — daily, so the repo deploys on any Vercel plan (a Hobby preview or test fork included):

```json
{ "regions": ["bom1"], "crons": [{ "path": "/api/cron/keepalive", "schedule": "0 6 * * *" }] }
```

Two more jobs must be wired **at deploy time on the production project**, or the features they back do not run:

| Job                  | Route                             | Cadence       | If unwired                                        |
| -------------------- | --------------------------------- | ------------- | ------------------------------------------------- |
| Email drain          | `/api/cron/drain-emails`          | every ~5 min  | Queued `pending_emails` are never sent            |
| Attachment reconcile | `/api/cron/reconcile-attachments` | daily         | Orphaned uploads / pending rows accumulate        |
| Queue health (alarm) | `/api/cron/queue-health`          | every ~15 min | A backed-up email/attachment queue fails silently |

The queue-health alarm checks email-queue depth/age and failed-upload counts and, on a breach, logs a structured `queue.health` error (surfaced by whatever ingests server logs — it is deliberately not an email, since the email queue itself may be the fault). The **drain cron already runs the same check after each pass** for free, so wiring queue-health separately only matters as an independent signal for when the drain itself isn't running. Thresholds live in `src/lib/services/queue-health.ts`.

Wire them one of two ways (both hit the same `CRON_SECRET`-guarded routes; Vercel auto-sends `Authorization: Bearer $CRON_SECRET` when the secret is set, and every `/api/cron/*` route fails closed without it):

- **Vercel Cron (needs Pro)** — add them to the production project's `vercel.json` `crons`. The 5-minute drain is sub-daily, which requires **Vercel Pro**; Hobby caps crons at 2 jobs, once-daily. Do **not** commit these to the repo's `vercel.json` if any deploy target (a preview or test fork) is on Hobby — Vercel rejects the whole deployment.
- **pg_cron + pg_net (plan-independent)** — schedule a Postgres job that `POST`s to the route with the `Authorization: Bearer <CRON_SECRET>` header. The `0058` migration ships this option commented at the bottom; use it when you are not on Vercel Pro everywhere.

## 6. Custodial Drive storage (optional)

If you want files held by the academy rather than pasted as links, set the four `GOOGLE_DRIVE_*` vars ([environment.md](environment.md)). One-time setup:

1. In Google Cloud, create an OAuth 2.0 client (client id + secret) for a **dedicated** Drive account (e.g. `files@`), Drive API enabled.
2. Run the consent flow **once by hand** for that account and capture the **refresh token**. Store it as `GOOGLE_DRIVE_REFRESH_TOKEN` (a rotating server secret).
3. Create the root Drive folder; put its id in `GOOGLE_DRIVE_ROOT_FOLDER_ID`. New uploads are filed under it, date-partitioned; the app streams bytes back through `/api/attachments/[id]/download` and never shares a public link.

See [adr/0006-custodial-attachment-storage.md](adr/0006-custodial-attachment-storage.md) for the design.

## 7. Verify and roll back

- Smoke-test the real sign-in on the production host (not a local build), then a grade-save, a receipt render, and a file upload if Drive is wired.
- **Rollback:** Vercel keeps every deployment — promote the previous one instantly from the dashboard. Do this first when a deploy misbehaves; diagnose second.

Run the full [production-checklist.md](production-checklist.md) before opening to users.
