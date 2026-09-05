# Cert-Ed Academia

Two applications share this repository and are split by host:

1. `certedacademia.com`: the public marketing site
2. `app.certedacademia.com`: the private academy portal

The portal is a class-centric learning and operations app for:

- super admins
- sub-admins
- tutors
- mentors
- students

## Current product model

- Access is allowlist-first. Accounts are created in `profiles` before a user signs in.
- Authentication is handled by Supabase Auth.
- Authorization is persona-driven through `persona_assignments` and capability resolution.
- `profiles.role` remains the fixed identity field used for account type and some UX decisions.
- The core academic model is class-based:
  - stream
  - classwork
  - people
  - attendance
  - grading
- The app also includes:
  - in-app messaging
  - in-app notifications
  - reminders
  - receipts and payslips
  - calendar and timetable
  - mentor-to-student oversight

## Tech stack

- Next.js 16 App Router
- TypeScript
- Supabase Auth and Postgres
- Tailwind CSS
- Vercel hosting

## Repository and branches

> **The live codebase is the `feature/cert-ed-academia-app` branch.**
> `main` still holds the superseded standalone marketing site and has no `src/`,
> `docs/`, or `supabase/`. A plain `git clone` checks out `main`, so switch first:
>
> ```bash
> git clone <repo-url> && cd wed_cert
> git checkout feature/cert-ed-academia-app
> ```

Remotes: `origin` is the primary repository; `test` is a deploy mirror whose `main`
branch builds the staging site. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Local development

Requires **Node 20 or newer** (CI builds on 20; `.nvmrc` pins 20 for nvm users).

The fastest local path is mock mode — a keyless, JSON-backed harness, so you need no
Supabase project to run the app:

```bash
npm install
cp .env.example .env.local   # ships with MOCK_MODE=1 — required, there is no auto-fallback
npm run dev
```

Then open:

- **Marketing site** — <http://localhost:3000>
- **Portal** — <http://app.localhost:3000> (the two are split by hostname; any host that
  is not `app.*` is served the marketing site)

Mock mode is **opt-in**: it activates only when `MOCK_MODE=1` (or `NEXT_PUBLIC_MOCK_MODE=1`)
is set, which `.env.example` does for you. Without a `.env.local` the portal stays dormant
and the Supabase client throws on the missing keys — absent env is not a fallback to mock.

Demo accounts (all use password `cert-ed`): `admin@mock.test`, `tutor@mock.test`, `mentor@mock.test`, `student@mock.test`, and more.

See [docs/mock-mode.md](docs/mock-mode.md) for the full seeded account list — including the sub-admin and hybrid tutor-mentor personas — and how the mock client behaves.

## Going live

Use the setup guide:

- [docs/setup-guide.md](docs/setup-guide.md)

Important:

- The authoritative database source is `supabase/migrations`
- The migration chain starts at `0001`; the current end is the highest-numbered file in `supabase/migrations/`
- Do not use only the early migrations listed in older notes or screenshots

## Testing

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
E2E_BUILD=1 npm run build
```

> `npm run build` is a **production** build, and a production build refuses to carry the
> mock variables. With the quick-start `.env.local` (which sets `MOCK_MODE=1`) a bare
> `npm run build` fails on purpose with
> `[build] Mock-only env var(s) set in a production deployment`.
> Prefix it with `E2E_BUILD=1` to sanction the mock config, or unset the `MOCK_*` vars.

End-to-end (Playwright). Browsers must be installed once, and each run does a full
production build, so allow a few minutes:

```bash
npx playwright install --with-deps chromium
npx playwright test
```

CI runs more gates than the list above — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
full set, including the RLS and privilege-parity suites.

## Project structure

Current key areas:

- `src/app/(mkt)`: marketing site routes
- `src/app/(prt)`: portal routes and route-local components only
- `src/lib/ui`: shared design system
- `src/lib/services`: domain orchestration
- `src/lib/data`: raw Supabase table access
- `src/lib/auth`: auth guards and access helpers
- `src/lib/capabilities`: persona baseline and capability resolution
- `src/lib/session`: actor context loading
- `src/lib/content`: marketing copy modules and the blog registry
- `src/content/blog`: MDX blog posts (see [docs/content-pipeline.md](docs/content-pipeline.md))
- `src/lib/mock`: mock mode harness
- `src/lib/api`: shared API and action response helpers
- `src/lib/validation`: schemas and input validation
- `supabase/migrations`: authoritative schema and RLS chain
- `supabase/rebuild`: rebuild snapshot derived from the migration end state
- `docs`: project documentation

Dependency direction is `app -> services -> data`, with `ui`, `validation`, `api`, and `auth/session` as shared leaves. See [docs/architecture-rules.md](docs/architecture-rules.md) for the binding rules.

## Documentation

Full index of every doc — architecture, schema, API, operations, and ADRs: **[docs/README.md](docs/README.md)**. Deploying to production starts at [docs/deployment.md](docs/deployment.md) and [docs/production-checklist.md](docs/production-checklist.md).

Current architecture status:

- The live layering is `src/app -> src/lib/services -> src/lib/data`
- `src/lib/ui` is the shared design-system home
- `src/lib/data` is the canonical home for raw Supabase access
- `src/features` does not exist in the live codebase yet
- `src/lib/services` remains the active domain-orchestration layer name
