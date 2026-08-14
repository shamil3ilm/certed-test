# Security operations

Operational runbook for the people who hold the keys.

## Secrets inventory

| Secret                                                              | Where it lives                   | Used by                               | Exposure if leaked                         |
| ------------------------------------------------------------------- | -------------------------------- | ------------------------------------- | ------------------------------------------ |
| `SUPABASE_SECRET_KEY`                                               | Hosting env (server only)        | `createAdminClient`, migrations, cron | Full DB read/write, bypasses RLS - highest |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Hosting env (build-time, public) | Browser and server Supabase client    | Low - public key, RLS still applies        |
| `CRON_SECRET`                                                       | Hosting env (server only)        | `/api/cron/*` keepalive guard         | Lets an attacker trigger cron routes       |
| Supabase project DB password                                        | Supabase dashboard               | Direct `psql` / migrations            | Full DB access                             |
| `GOOGLE_DRIVE_CLIENT_SECRET` / `GOOGLE_DRIVE_REFRESH_TOKEN`         | Hosting env (server only)        | Custodial Drive attachment storage    | Read/write the academy's Drive account     |
| `RESEND_API_KEY`                                                    | Hosting env (server only)        | Email notification delivery           | Send mail as the academy sender            |
| `SENTRY_DSN`                                                        | Hosting env (server/edge)        | Error-tracking ingest                 | Low - ingest only, can spoof events        |

Rules:

- Never hardcode a secret in source.
- Read secrets from `process.env`.
- `NEXT_PUBLIC_*` values are build-time public vars and must be present at build time.
- The service-role key must never reach the client bundle or logs.

## Rotation

Rotate on a schedule and immediately on any suspected leak.

1. Service-role and publishable keys: roll in Supabase, update hosting env, and trigger a fresh build so rotated `NEXT_PUBLIC_*` values are re-inlined
2. `CRON_SECRET`: generate a new random value, update the host env and scheduler config together, then confirm a cron run succeeds
3. DB password: reset in the dashboard and update any external tooling that connects directly
4. `GOOGLE_DRIVE_REFRESH_TOKEN`: re-run `scripts/get-drive-refresh-token.mjs` to mint a fresh token (revoke the old grant in the Google account if it may have leaked), then update the host env
5. `RESEND_API_KEY`: roll the key in the Resend dashboard and update the host env

After any rotation, review recent logs to confirm the old secret is no longer referenced.

## Backup and recovery

Backups, PITR, and the restore drill are owned by [operations.md](operations.md#backups-and-restore). The authoritative schema is `supabase/migrations/` plus the rebuild snapshot in `supabase/rebuild/`.

## Security incident response

For the general playbook — roll back first, read the right log — see [operations.md](operations.md#incident-response). The security-specific steps:

1. Rotate the implicated secret first (above).
2. Review `audit_log` and observability logs for the affected window.
3. If RLS or a guard is implicated, disable the affected capability via admin override while a fix ships.
4. Record the incident and follow-up actions.
