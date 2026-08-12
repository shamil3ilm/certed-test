# Operations runbook

Day-2 operations: backups, monitoring, incident response, and the failures most likely to occur. For first-time provisioning see [deployment.md](deployment.md).

## Backups and restore

- **Backups:** Supabase Pro takes daily backups; enable **PITR** too. This app is the system of record for financial documents (receipts, payslips) — running without backups is not a risk posture, it is the absence of one.
- **Restore drill (do it once, then annually):** a backup you have never restored is a hypothesis. Restore the latest backup into a scratch project, apply nothing else, and confirm the schema head matches `supabase/rebuild/0000_full_rebuild.sql`'s marker and that a sample receipt renders. Record how long it took — that is your RTO.
- **Retention:** `audit_log` is purged after 24 months and read `notifications` after 90 days, both by `pg_cron` (migrations `0059` / `0051`). Confirm the jobs exist: `select jobname, schedule from cron.job;`.

## Monitoring

- **Sentry** — set `SENTRY_DSN` (server/edge) and `NEXT_PUBLIC_SENTRY_DSN` (browser). Until a DSN is set, capture is a no-op and the client SDK is folded out of the bundle entirely. `logError` forwards server-side failures — including swallowed best-effort catches — to Sentry.
- **Request correlation** — every authenticated request stamps its `x-vercel-id` onto the Sentry isolation scope (tag `vercel_id`) and into the `logError` `requestId` field, so one request can be followed across the proxy, the render, and the data layer. Search Sentry by `vercel_id` to line an event up with the Vercel request log.
- **Liveness** — `/api/health` (public, memoised 30s) and `/api/cron/keepalive` (secret-gated) keep the function and the Supabase project warm.

## Incident response

1. **Check the deployment first.** Is the fix even live? The deployed build can lag the codebase. Confirm which commit built, that it was a fresh (no-cache) build, and that the production domain points to it.
2. **Roll back before diagnosing.** Vercel keeps every deployment — promote the last good one from the dashboard, then investigate.
3. **Read the right log.** Build-time, runtime/server, and browser-console are three different places. A client error never appears in server logs; a build problem never appears in runtime logs. Use the `vercel_id` to correlate.
4. **Rotate on exposure.** If a secret may have leaked, rotate it (inventory and steps in [security-operations.md](security-operations.md)) — `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, the `GOOGLE_DRIVE_*` set.

## Common failures

| Symptom                                              | Likely cause                                                                                                      | Fix                                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Sign-in broken for everyone, nothing in runtime logs | a `NEXT_PUBLIC_*` var was missing or marked "Sensitive" at build, so it inlined as `undefined`                    | set it non-Sensitive, redeploy **without** build cache ([environment.md](environment.md))                                     |
| Notification emails never arrive                     | the email **drain** cron is not wired, or `EMAIL_NOTIFICATIONS_ENABLED`/`RESEND_API_KEY`/`EMAIL_FROM` not all set | wire `/api/cron/drain-emails` ([deployment.md](deployment.md#5-cron-jobs)); the queue keeps the rows until it runs            |
| Password resets silently fail                        | still on Supabase built-in SMTP (rate-limited)                                                                    | switch Auth to custom SMTP → Resend ([deployment.md](deployment.md#2-auth-email--custom-smtp-do-this-before-inviting-anyone)) |
| Dashboard slow / timing out under load               | Supabase region not co-located with Vercel `bom1`                                                                 | move the Supabase project to the matching region                                                                              |
| `/api/cron/*` returns 401                            | `CRON_SECRET` unset or the caller's `Authorization: Bearer` header is wrong                                       | the routes fail closed by design — set the secret and match the header                                                        |
| Uploaded file won't open                             | `GOOGLE_DRIVE_*` unset/rotated, or the row is not `active`                                                        | check the four Drive vars and the attachment's `status`; the reconcile job sweeps stuck `pending` rows                        |
| PDF route 502 / OOM                                  | headless Chromium needs more memory                                                                               | raise the function memory on `/api/**/pdf`                                                                                    |

## Related

- [deployment.md](deployment.md) · [environment.md](environment.md) · [security-operations.md](security-operations.md) · [production-checklist.md](production-checklist.md)
