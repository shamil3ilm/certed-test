# Contributing

Cert-Ed Academia is a Next.js 16 (App Router) + Supabase learning portal. This is the short version; the full documentation map is [docs/README.md](docs/README.md).

## Branches and remotes

**The live codebase is `feature/cert-ed-academia-app`.** `main` still holds the superseded
standalone marketing site (no `src/`, `docs/`, or `supabase/`), so a fresh clone lands on
the wrong tree — check out the working branch first.

| Remote   | Repository               | Role                                                      |
| -------- | ------------------------ | --------------------------------------------------------- |
| `origin` | `certedapp/wed_cert`     | Primary repository                                        |
| `test`   | `shamil3ilm/certed-test` | Deploy mirror — its `main` branch builds the staging site |

## Running locally

Requires **Node 20 or newer** (CI builds on 20; `.nvmrc` pins 20 for nvm users). The app runs against a mock database, so no Supabase
project is required:

```bash
npm install
cp .env.example .env.local   # sets MOCK_MODE=1 — required; there is no auto-fallback
npm run dev
```

Marketing is <http://localhost:3000>; the portal is <http://app.localhost:3000> (the two
are split by hostname). Mock mode is opt-in — without `.env.local` the portal stays
dormant and the Supabase client throws on the missing keys.

Mock mode seeds a local store from `src/lib/mock/seed.ts` and persists it to `.mock-db.json`. See [docs/mock-mode.md](docs/mock-mode.md) for the seeded accounts and how the mock client behaves.

To run against a real Supabase project, set the environment variables listed in [docs/setup-guide.md](docs/setup-guide.md).

## Gates

Run these before every PR — they are the fast ones and catch most failures:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
E2E_BUILD=1 npm run build
```

`npm run format` fixes formatting in place.

> `npm run build` is a **production** build and refuses the mock variables by design, so a
> bare `npm run build` fails once you have the quick-start `.env.local`. Prefix it with
> `E2E_BUILD=1`, or unset the `MOCK_*` vars.

CI runs more than that list. The full set, by job:

| Job          | Gate                                                                                        | Run locally                                                                    |
| ------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| repo hygiene | migration prefixes unique, snapshot freshness, doc links resolve, hooks executable          | `npm run check:snapshot`, `npm run check:doc-links`, `npm run check:hooks`     |
| build + test | `format:check`, `lint`, `typecheck`, **`test:coverage`**, `build`, first-load bundle budget | as above, plus `npm run test:coverage` and `npm run check:bundle`              |
| e2e          | Playwright (chromium)                                                                       | `npx playwright install --with-deps chromium` once, then `npx playwright test` |
| database     | RLS policy assertions, privilege parity (migrations vs snapshot)                            | `bash scripts/test-rls.sh`, `bash scripts/test-privilege-parity.sh`            |

Notes on the ones with prerequisites:

- **`test:coverage`** is the gate CI uses, not `test` — it enforces the thresholds in
  `vitest.config.ts`. Adding untested code can fail CI even when `npm run test` is green.
- **`check:bundle`** reads `.next/build-manifest.json`, so it needs a build first.
- **Playwright** builds the app inside its `webServer` (ports 3100/3101), so a run takes
  several minutes.
- **The database gates** need a local Postgres on `127.0.0.1` (superuser `postgres`); the
  RLS suite creates and drops a scratch database. They are the only real proof of the RLS
  policies — mock mode cannot exercise them.

## Git hooks

`npm install` runs the `prepare` script, which points git at `.githooks/` (`git config core.hooksPath .githooks`). Two guards then run automatically:

- **pre-commit** — Prettier-checks the staged files, and (when the commit stages a `supabase/migrations/*.sql`) blocks unless the rebuild snapshot is current — keeping migration and snapshot atomic in one commit.
- **pre-push** — runs the snapshot-freshness check and `check:doc-links`; a stale snapshot or a broken cross-doc link blocks the push.

Both run the same scripts CI runs. They are a subset of CI, not a substitute for it — see the gate table above. Bypass in a genuine emergency with `--no-verify`.

## Database changes

- Add a migration in `supabase/migrations/` using the next free number. Never trust a hard-coded range quoted in prose.
- Migrations must be idempotent where practical and safe to replay.
- Follow [docs/migration-checklist.md](docs/migration-checklist.md).
- After schema changes, regenerate the rebuild snapshot with `npm run db:rebuild-snapshot` — the pre-commit hook blocks the migration commit until you do.
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
- House style: a sentence-case `#` title, a one-line purpose beneath it, single-line prose, and a `## Related` footer of sibling links where it helps. Debugging while building lives in [docs/troubleshooting.md](docs/troubleshooting.md); production incidents live in [docs/operations.md](docs/operations.md).

## Commits and PRs

- Conventional commit messages such as `feat:`, `fix:`, `refactor:`, `docs:`
- Every behavioral change ships with tests or explicit verification
- Do not commit secrets; see [docs/security-operations.md](docs/security-operations.md)
