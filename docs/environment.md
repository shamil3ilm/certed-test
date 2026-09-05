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

Server-only; a refresh token for the academy's dedicated Drive account, exchanged for short-lived access tokens. Never `NEXT_PUBLIC`. Mint the refresh token with `scripts/get-drive-refresh-token.mjs` (one-time OAuth consent); see [deployment.md](deployment.md) for the full flow.

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

| Variable                              | Scope            | Secret | Purpose                                                                       |
| ------------------------------------- | ---------------- | ------ | ----------------------------------------------------------------------------- |
| `PRODUCTION_SEED_ADMIN_EMAIL`         | runtime (server) | no     | First admin email — allowlisted by `scripts/seed-production-allowlist.mjs`    |
| `PRODUCTION_SEED_TEACHER_EMAIL`       | runtime (server) | no     | First teacher/tutor email — same seed script                                  |
| `PRODUCTION_SEED_STUDENT_EMAIL`       | runtime (server) | no     | First student email — same script (all three also accept positional CLI args) |
| `GOOGLE_SCRIPT_URL`                   | runtime (server) | no     | Google Apps Script endpoint for the marketing contact form                    |
| `PORTAL_ONLY`                         | runtime          | no     | `1` on single-host preview deploys — forces every request to the portal       |
| `MOCK_MODE` / `NEXT_PUBLIC_MOCK_MODE` | build + runtime  | no     | `1` runs the keyless JSON-file fake of Supabase (local + E2E only)            |
| `MOCK_PASSWORD`                       | runtime          | no     | Shared password for the seeded demo users (default `cert-ed`)                 |
| `MOCK_CHROME_PATH`                    | runtime          | no     | Chrome path for finance-PDF rendering in local dev                            |

## Mock / test-only — never set these in a real deployment

The mock stack is a keyless JSON-file fake of Supabase with plaintext demo passwords and
an **unsigned** identity cookie. Three variables can widen where it is allowed to run, so
they are listed separately: any of them present in a production environment is an incident
(`production-checklist.md` treats them as go-live blockers, and `instrumentation.ts` throws
at boot if they are found there).

| Variable             | Scope   | Secret | Purpose                                                                                                                                                                                |
| -------------------- | ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALLOW_MOCK_AUTH`    | runtime | no     | Affirmative opt-in letting mock mode activate under `NODE_ENV=production` on a **non-Vercel** host. Used only by the Playwright run.                                                   |
| `E2E_BUILD`          | build   | no     | Sanctions a production-mode build that carries the `MOCK_*` vars. Without it `npm run build` refuses them by design — this is the flag the local-build error message tells you to use. |
| `SEED_TEST_PASSWORD` | runtime | no     | Password used by `scripts/seed-test-users.mjs` (default `CertEd@123`)                                                                                                                  |

`isMock()` fails closed: it is hard-disabled whenever `VERCEL=1`, so no Vercel deployment
(**preview included**) can run the mock stack regardless of the above.

## Platform-provided (read, never set by you)

| Variable                     | Read by                                | Why it matters                                                               |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `VERCEL`                     | `src/lib/mock/env.ts`                  | `1` hard-disables mock mode on any Vercel deploy                             |
| `VERCEL_ENV`                 | `instrumentation.ts`, `next.config.js` | `preview` sanctions mock config in a preview build                           |
| `NEXT_PUBLIC_SENTRY_ENABLED` | `instrumentation-client.ts`            | Derived at build from the DSN; folds the Sentry SDK out of the client bundle |
| `CI`                         | `scripts/validate-build-env.mjs`       | Distinguishes a CI build from a developer's laptop in guard messaging        |

### Legacy alias

`SUPABASE_SERVICE_ROLE_KEY` is accepted as a fallback for `SUPABASE_SECRET_KEY` by
`scripts/seed-test-data.ts` and `scripts/verify-migrations.ts` only. New configuration
should set `SUPABASE_SECRET_KEY`.

## Environment separation

Use **separate** Supabase projects and Drive root folders for production vs preview — a preview deploy pointed at production data can mutate live records. Set the `NEXT_PUBLIC_*` and secret values per Vercel environment (Production / Preview) so a preview build never inlines production endpoints.

## Related

- [deployment.md](deployment.md) — provisioning and first deploy
- [operations.md](operations.md) — day-2 runbook (backups, monitoring, incidents)
- [security-operations.md](security-operations.md) — secret inventory and rotation
