# Contributing

Cert-Ed Academia is a Next.js 14 (App Router) + Supabase learning portal. This is the
short version; deeper references live in [`docs/`](docs/).

## Running locally

The app runs against a mock database with no Supabase project required:

```bash
npm install
npm run dev          # mock mode is on when Supabase env vars are absent
```

Mock mode seeds an in-memory store from `src/lib/mock/seed.ts` and persists it to
`.mock-db.json`. See [docs/mock-mode.md](docs/mock-mode.md) for the seeded accounts and how
the mock client behaves (notably, it does not apply `.eq()`/`.in()` filters).

To run against a real Supabase project, set the environment variables listed in
[docs/setup-guide.md](docs/setup-guide.md).

## The four gates (run before every PR)

CI runs exactly these, in this order:

```bash
npm run format:check   # prettier
npm run lint           # eslint (flat config, ESLint 9)
npm run typecheck      # tsc --noEmit
npm run test           # vitest
npm run build          # next build (catches route/data-collection failures)
```

`npm run format` fixes formatting in place. Keep all five green.

## Database changes

- Add a migration in `supabase/migrations/` using the next free number (list the directory
  — never trust a range quoted in prose). Two files sharing a number is a silent
  data-integrity bug; CI fails on duplicate version prefixes.
- Migrations must be idempotent (`create table if not exists`, `do $$ … exception when
duplicate_object`) so they can be re-applied safely.
- Follow [docs/migration-checklist.md](docs/migration-checklist.md); after schema changes,
  regenerate the rebuild snapshot with `npm run db:rebuild-snapshot`.
- Read/write access is governed by RLS — see [docs/rls-policy-inventory.md](docs/rls-policy-inventory.md).

## Conventions

- Layer as `data → services → page-data → UI`; see
  [ADR 0001](docs/adr/0001-adopt-data-layer.md).
- Gate on capabilities, not personas; see [ADR 0002](docs/adr/0002-capability-first-route-guards.md).
- Coding standards live in [docs/application-standards.md](docs/application-standards.md)
  and [docs/architecture-rules.md](docs/architecture-rules.md).
- Comments describe what the app does — not process/tracking metadata.

## Commits & PRs

- Conventional commit messages (`feat:`, `fix:`, `refactor:`, `docs:`, …).
- Every behavioural change ships with tests.
- Do not commit secrets; see [docs/security-operations.md](docs/security-operations.md).
