# Environment variables

Every variable the app reads, where it must be set, and whether it is a secret. `.env.example` is the copy-paste starting point for local development; this table is the authoritative reference for a production deployment.

## The one rule that bites people

`NEXT_PUBLIC_*` variables are **inlined into the browser bundle at _build_ time** by literal text substitution. Two consequences on Vercel:

- **Never mark a `NEXT_PUBLIC_*` var "Sensitive."** Vercel withholds Sensitive vars from the build step, so it inlines as `undefined` and the browser Supabase client silently fails — sign-in breaks for everyone, with nothing in the runtime logs. `next.config.js` throws at build if the two public Supabase vars are missing, to catch this in the deploy log rather than a user's browser.
- **Changing a `NEXT_PUBLIC_*` value needs a fresh build** (redeploy without "Use existing Build Cache"), or the old value stays inlined.

Server-only secrets (everything in the "Secret" column below) **should** be marked Sensitive.

## Core — required in production (`MOCK_MODE=0`)

| Variable                               | Scope            | Secret  | Purpose                                                                    |
| -------------------------------------- | ---------------- | ------- | -------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | build + runtime  | no      | Supabase project URL; inlined into the client                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build + runtime  | no      | Supabase anon/publishable key; inlined into the client                     |
| `SUPABASE_SECRET_KEY`                  | runtime (server) | **yes** | Service-role key for the RLS-bypassing admin client                        |
| `CRON_SECRET`                          | runtime (server) | **yes** | Bearer secret guarding every `/api/cron/*` route (fails closed when unset) |
| `APP_HOSTNAME`                         | runtime          | no      | Portal host, e.g. `app.certedacademia.com` (host-based routing)            |
| `MARKETING_HOSTNAME`                   | runtime          | no      | Marketing host, e.g. `certedacademia.com`                                  |

## Email notifications via Resend (optional — off unless all three are set)

| Variable                      | Scope            | Secret  | Purpose                                                                       |
| ----------------------------- | ---------------- | ------- | ----------------------------------------------------------------------------- |
| `EMAIL_NOTIFICATIONS_ENABLED` | runtime          | no      | Must be `true` to enable the queue drain                                      |
| `RESEND_API_KEY`              | runtime (server) | **yes** | Resend API key                                                                |
| `EMAIL_FROM`                  | runtime          | no      | A Resend-verified sender, e.g. `Cert-Ed Academia <notify@certedacademia.com>` |
| `NEXT_PUBLIC_APP_URL`         | build + runtime  | no      | Absolutises links inside emails                                               |

## Custodial Drive attachment storage (optional — off unless all four are set)

Server-only; a refresh token for the academy's dedicated Drive account, exchanged for short-lived access tokens. Never `NEXT_PUBLIC`. See [deployment.md](deployment.md) for the one-time consent flow.

| Variable                      | Scope            | Secret  | Purpose                                     |
| ----------------------------- | ---------------- | ------- | ------------------------------------------- |
| `GOOGLE_DRIVE_CLIENT_ID`      | runtime (server) | **yes** | OAuth 2.0 client id                         |
| `GOOGLE_DRIVE_CLIENT_SECRET`  | runtime (server) | **yes** | OAuth 2.0 client secret                     |
| `GOOGLE_DRIVE_REFRESH_TOKEN`  | runtime (server) | **yes** | Refresh token for the academy Drive account |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | runtime          | no      | Drive folder new uploads are filed under    |

## Error tracking via Sentry (optional — off unless the DSN is set)

| Variable                 | Scope                 | Secret  | Purpose                                                                        |
| ------------------------ | --------------------- | ------- | ------------------------------------------------------------------------------ |
| `SENTRY_DSN`             | runtime (server/edge) | **yes** | Server + edge capture; also the sink for `logError`                            |
| `NEXT_PUBLIC_SENTRY_DSN` | build + runtime       | no      | Browser capture; the ~145 KB SDK is folded out of the client bundle when unset |

## Other / operational

| Variable                              | Scope            | Secret | Purpose                                                                 |
| ------------------------------------- | ---------------- | ------ | ----------------------------------------------------------------------- |
| `SEED_ADMIN_EMAIL`                    | runtime (server) | no     | Consumed only by the one-time first-admin seed command                  |
| `GOOGLE_SCRIPT_URL`                   | runtime (server) | no     | Google Apps Script endpoint for the marketing contact form              |
| `PORTAL_ONLY`                         | runtime          | no     | `1` on single-host preview deploys — forces every request to the portal |
| `MOCK_MODE` / `NEXT_PUBLIC_MOCK_MODE` | build + runtime  | no     | `1` runs the keyless JSON-file fake of Supabase (local + E2E only)      |
| `MOCK_PASSWORD`                       | runtime          | no     | Shared password for the seeded demo users (default `cert-ed`)           |
| `MOCK_CHROME_PATH`                    | runtime          | no     | Chrome path for finance-PDF rendering in local dev                      |

## Environment separation

Use **separate** Supabase projects and Drive root folders for production vs preview — a preview deploy pointed at production data can mutate live records. Set the `NEXT_PUBLIC_*` and secret values per Vercel environment (Production / Preview) so a preview build never inlines production endpoints.

## Related

- [deployment.md](deployment.md) — provisioning and first deploy
- [operations.md](operations.md) — day-2 runbook (backups, monitoring, incidents)
- [security-operations.md](security-operations.md) — secret inventory and rotation
