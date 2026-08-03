# Security operations: secrets, rotation, backup & recovery

Operational runbook for the people who hold the keys. Pairs with the security posture
described in the architecture audit and the RLS inventory.

## Secrets inventory

| Secret                                          | Where it lives                   | Used by                               | Exposure if leaked                             |
| ----------------------------------------------- | -------------------------------- | ------------------------------------- | ---------------------------------------------- |
| `SUPABASE_SECRET_KEY` (service role)            | Hosting env (server only)        | `createAdminClient`, migrations, cron | Full DB read/write, bypasses RLS — **highest** |
| `NEXT_PUBLIC_SUPABASE_URL` / `…PUBLISHABLE_KEY` | Hosting env (build-time, public) | Browser + server Supabase client      | Low — public anon key, RLS still applies       |
| `CRON_SECRET`                                   | Hosting env (server only)        | `/api/cron/*` keepalive guard         | Lets an attacker trigger cron routes           |
| Supabase project DB password                    | Supabase dashboard               | Direct `psql` / migrations            | Full DB access                                 |
| OAuth / SMTP provider keys (when added)         | Hosting env                      | Auth, email delivery                  | Provider-scoped                                |

Rules:

- Never hardcode a secret in source. Read from `process.env`; the build fails fast via
  `scripts/validate-build-env.mjs` when a required public var is missing.
- `NEXT_PUBLIC_*` are build-time and public — must **not** be marked "Sensitive" in the
  host, or they will not inline into the build. Everything else is server-only.
- The service-role key must never reach the client bundle or logs.

## Rotation

Rotate on a schedule (recommended: every 90 days) and immediately on any suspected leak or
departure of someone with access.

1. **Service-role / publishable keys** — in the Supabase dashboard, roll the key, update
   the hosting env, and trigger a fresh (no-cache) build so a rotated `NEXT_PUBLIC_*`
   value re-inlines. Verify the app still authenticates before removing the old value.
2. **`CRON_SECRET`** — generate a new random value, update the host env and the scheduler
   config together, then confirm a cron run succeeds.
3. **DB password** — reset in the dashboard; update any external tooling that connects
   directly. App traffic uses the API keys, not the password.

After any rotation, grep recent logs to confirm the old secret is no longer referenced.

## Backup & disaster recovery

- **Backups:** Supabase provides automated daily backups (and point-in-time recovery on
  paid tiers). Confirm the retention window in the project's Database → Backups settings.
- **Schema as code:** the authoritative schema is `supabase/migrations/` plus the rebuild
  snapshot in `supabase/rebuild/`. A database can be reconstructed from these alone.
- **Restore drill (do at least once):**
  1. Create a scratch Supabase project.
  2. Apply the migration chain (or the rebuild snapshot) and run
     `npx ts-node scripts/verify-migrations.ts` to confirm tables/policies exist.
  3. Restore the most recent data backup into it and smoke-test sign-in + a class page.
- **RPO/RTO:** with daily backups the recovery point is up to 24h of data; document the
  acceptable target and upgrade the Supabase tier if a tighter RPO is required.

## Incident response (short form)

1. Rotate the implicated secret first (see above).
2. Review `audit_log` and the observability logs (`src/lib/observability/log.ts`) for the
   affected window.
3. If RLS or a guard is implicated, disable the affected capability via admin override
   while a fix ships.
4. Record the incident and any follow-up as an issue.
