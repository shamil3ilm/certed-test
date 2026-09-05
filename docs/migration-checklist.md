# Migration checklist

Keep schema, RLS, docs, and tests aligned whenever a database migration changes the system. Work top to bottom for any migration.

## Use this checklist when

- adding a new migration
- changing RLS
- changing helper-function authority
- adding a new table
- changing access behavior
- changing a hot-path query shape or index strategy

## 1. Migration design

1. Is this change append-only?
2. Is the migration name specific and readable?
3. Does the migration do one coherent job?
4. If the change is risky, is it broken into smaller steps?

## 2. Schema and policy correctness

1. Are referenced tables and columns current and correct?
2. Are referenced helper functions current and correct?
3. If RLS changes, do the policy names match the live chain?
4. Does the migration preserve intended security boundaries?
5. Does the migration fail closed where appropriate?

## 3. App alignment

1. Does the application code need to change for this migration?
2. Do any guards, persona rules, or capability rules need updates?
3. Do any page loaders or service commands need updates?
4. Does mock mode need matching support? A new table needs a `buildSeed()` key (the
   `mock-schema-parity` gate enforces this). A NOT NULL foreign key the app must resolve
   and attach also belongs in `src/lib/mock/constraints.ts`, or mock mode will accept a
   write Postgres rejects and the E2E suite will go green on it.

## 4. Documentation alignment

Update any affected docs in the same workstream:

- `docs/schema-reference.md` — a section per table (add one whenever a migration adds a table)
- `docs/rls-policy-inventory.md` — the table's policy family, whenever RLS changes
- `docs/fk-cascade-inventory.md` — whenever a migration adds or changes a foreign key
- `docs/api-reference.md` — whenever a route is added or its guard changes
- `docs/persona-model.md` — when persona or capability support changes
- `docs/mock-mode.md` — when the mock's seed, constraints or limitations change
- `supabase/README.md` — add the migration to the "notable groups" list
- `README.md` / `docs/setup-guide.md` — if the setup or feature surface changes

The `check:doc-links` gate (CI + pre-push) catches a link broken by a doc move; it does **not** catch a doc left stale by a schema change — that is on this checklist.

## 5. Rebuild alignment (required in the SAME change that adds a migration)

A migration that advances the chain head changes the snapshot's expected `0001..NNNN` marker, and CI's rebuild-freshness check is now a **blocking gate** (`exit 1`, no longer warn-only). Regenerate the snapshot **in the same change that adds the migration** — not "later" — or the gate blocks the next, unrelated PR (this is exactly how the snapshot drifted 4 migrations behind before the gate was made blocking):

1. `npx supabase db reset` — replay the full chain (`0001..NNNN`) onto a fresh local DB (see prerequisites below).
2. `npm run db:rebuild-snapshot` — dump that end state into `supabase/rebuild/0000_full_rebuild.sql` (the script re-derives the `0001..NNNN` marker the CI check parses).
3. `git diff supabase/rebuild/0000_full_rebuild.sql` — review, then commit it **alongside** the migration.

If you cannot run a local DB, the migration is **not ready to merge**: the snapshot would drift and the freshness gate would block the next PR.

### Prerequisites for step 1

The Supabase CLI is already a devDependency, so use `npx supabase` — no global install. It
does **not** use a local Postgres install; it runs Postgres in a container, so you need:

- **Docker Desktop or Podman** running, and
- an initialised local project — this repo does not commit a `supabase/config.toml`, so run
  `npx supabase init` once before the first `db reset`.

Alternative if you cannot run containers: point the CLI at a database that already has the
**entire** chain applied (`npx supabase link --project-ref <ref>`) and run step 2 against
it. The snapshot is a `pg_dump` of the end state, so any fully-migrated database works —
never hand-edit the snapshot to "catch it up".

This is enforced locally, not just in CI: `.githooks/pre-commit` blocks a commit that stages a `supabase/migrations/*.sql` while the snapshot is stale, and `.githooks/pre-push` runs the same `scripts/check-snapshot-freshness.sh` — so migration and snapshot stay atomic before CI ever sees them (hooks are wired by the package.json `prepare` script; bypass in an emergency with `--no-verify`).

## 6. Test alignment

1. Add or update unit tests where behavior changes.
2. Add or update E2E checks where workflow changes.
3. If access rules changed, update permission coverage.

## 7. Verification

1. Can the migration apply cleanly?
2. Are the expected tables, helpers, indexes, and policies present afterwards?
3. Are there any transitional paths that must be tracked for later cleanup?

## 8. Completion rule

A migration change is not complete until:

1. schema is correct
2. docs are updated
3. tests are aligned
4. the rebuild snapshot has been regenerated in this same change whenever the migration advanced the chain head (§5) — this is a hard requirement now that the freshness check blocks CI, not an "if needed"
