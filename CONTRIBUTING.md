# Contributing

Cert-Ed Academia is a Next.js 16 (App Router) + Supabase learning portal. This is the short version; the full documentation map is [docs/README.md](docs/README.md).

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

## Documentation

- The index — and the canonical owner for each topic — is [docs/README.md](docs/README.md). One doc owns each subject: **architecture-rules** for layering, **schema-reference** for tables, **environment** for variables, **rls-policy-inventory** for policies. Link to the owner rather than restating it.
- Update the affected docs in the **same PR** as the change. For schema changes, [docs/migration-checklist.md](docs/migration-checklist.md) §4 lists exactly which docs to touch.
- Deploying to production? Start at [docs/deployment.md](docs/deployment.md) and [docs/production-checklist.md](docs/production-checklist.md).
- `npm run check:doc-links` (also a CI + pre-push gate) fails on a broken cross-doc link. Prose is written unwrapped (one line per bullet/paragraph); the formatter aligns tables.

## Commits and PRs

- Conventional commit messages such as `feat:`, `fix:`, `refactor:`, `docs:`
- Every behavioral change ships with tests or explicit verification
- Do not commit secrets; see [docs/security-operations.md](docs/security-operations.md)
