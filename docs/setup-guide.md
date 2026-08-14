# Setup guide

How to run Cert-Ed Academia locally and the path to a live deployment. Local development needs nothing but Node; going live is owned by [deployment.md](deployment.md) and gated by [production-checklist.md](production-checklist.md) — this guide points you there rather than restating them.

## 1. Run locally (mock mode)

No Supabase or Google account needed — the portal runs against a JSON-file fake of Supabase.

```bash
npm install
npm run dev
```

Sign in at `/login` with a seeded demo account (e.g. `admin@mock.test` / `cert-ed`). See [mock-mode.md](mock-mode.md) for the full account list and how the mock client behaves.

## 2. Run against a real Supabase project

1. Create a Supabase project (one per environment). Collect `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`.
2. Apply the **full** migration chain in `supabase/migrations/` in order — from `0001` to the highest-numbered file, never stopping at an early number quoted in older notes. See [../supabase/README.md](../supabase/README.md).
3. Set the environment variables. The authoritative list is [environment.md](environment.md); the minimum is the three Supabase vars plus `APP_HOSTNAME`, `MARKETING_HOSTNAME`, and `CRON_SECRET`.
4. Set `MOCK_MODE=0`.

## 3. Seed the allowlist

The app is allowlist-first: a user must already have a `profiles` row, and first sign-in binds their auth identity to it. Seed the first admin, teacher, and student:

```bash
node scripts/seed-production-allowlist.mjs <admin-email> <teacher-email> <student-email>
```

The three emails can also come from `PRODUCTION_SEED_ADMIN_EMAIL` / `PRODUCTION_SEED_TEACHER_EMAIL` / `PRODUCTION_SEED_STUDENT_EMAIL`.

## 4. Optional integrations

Each is off unless its variables are set — see [environment.md](environment.md):

- **Google sign-in** — configure it inside Supabase Auth; keep redirect URLs aligned with your app host.
- **Custodial Drive storage** — the four `GOOGLE_DRIVE_*` vars. There is no browser file picker; uploads are stored server-side in the academy's own Drive and streamed back through the app. Mint the refresh token with `scripts/get-drive-refresh-token.mjs`.
- **Email notifications** (Resend) and **error tracking** (Sentry).

## 5. Going live

Provisioning, custom SMTP, cron jobs, and the first deploy are owned by [deployment.md](deployment.md). Work through [production-checklist.md](production-checklist.md) before opening the portal to real users.

## Related

- [mock-mode.md](mock-mode.md) · [environment.md](environment.md) · [deployment.md](deployment.md) · [production-checklist.md](production-checklist.md) · [../supabase/README.md](../supabase/README.md)
