# Contributing

Cert-Ed Academia is a Next.js 16 (App Router) + Supabase learning portal. This is the short version; deeper references live in [`docs/`](docs/).

## Running locally

The app runs against a mock database with no Supabase project required:

```bash
npm install
npm run dev
```

Mock mode seeds a local store from `src/lib/mock/seed.ts` and persists it to `.mock-db.json`. See [docs/mock-mode.md](docs/mock-mode.md) for the seeded accounts and how the mock client behaves.

To run against a real Supabase project, set the environment variables listed in [docs/setup-guide.md](docs/setup-guide.md).

## The five gates

Run these before every PR:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

`npm run format` fixes formatting in place. Keep all five green.

## Database changes

- Add a migration in `supabase/migrations/` using the next free number. Never trust a hard-coded range quoted in prose.
- Migrations must be idempotent where practical and safe to replay.
- Follow [docs/migration-checklist.md](docs/migration-checklist.md).
- After schema changes, regenerate the rebuild snapshot with `npm run db:rebuild-snapshot`.
- Read/write access is governed by RLS - see [docs/rls-policy-inventory.md](docs/rls-policy-inventory.md).

## Conventions

- Layer as `data -> services -> page-data -> UI`; see [ADR 0001](docs/adr/0001-adopt-data-layer.md).
- Gate on capabilities, not personas; see [ADR 0002](docs/adr/0002-capability-first-route-guards.md).
- Coding standards live in [docs/application-standards.md](docs/application-standards.md) and [docs/architecture-rules.md](docs/architecture-rules.md).
- Comments describe the live system, not commit or phase history.

## Commits and PRs

- Conventional commit messages such as `feat:`, `fix:`, `refactor:`, `docs:`
- Every behavioral change ships with tests or explicit verification
- Do not commit secrets; see [docs/security-operations.md](docs/security-operations.md)
