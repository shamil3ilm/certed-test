# Migration Checklist

- Status: Active checklist
- Purpose: Keep schema, RLS, docs, and tests aligned whenever database migrations change the system.

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
4. Does mock mode need matching support?

## 4. Documentation alignment

Update any affected docs in the same workstream:

- `docs/schema-reference.md` — a section per table (add one whenever a migration adds a table)
- `docs/rls-policy-inventory.md` — the table's policy family, whenever RLS changes
- `docs/fk-cascade-inventory.md` — whenever a migration adds or changes a foreign key
- `docs/api-reference.md` — whenever a route is added or its guard changes
- `docs/persona-model.md` — when persona or capability support changes
- `supabase/README.md` — add the migration to the "notable groups" list
- `README.md` / `docs/setup-guide.md` — if the setup or feature surface changes

The `check:doc-links` gate (CI + pre-push) catches a link broken by a doc move; it
does **not** catch a doc left stale by a schema change — that is on this checklist.

## 5. Rebuild alignment (required in the SAME change that adds a migration)

A migration that advances the chain head changes the snapshot's expected `0001..NNNN`
marker, and CI's rebuild-freshness check is now a **blocking gate** (`exit 1`, no longer
warn-only). Regenerate the snapshot **in the same change that adds the migration** — not
"later" — or the gate blocks the next, unrelated PR (this is exactly how the snapshot
drifted 4 migrations behind before the gate was made blocking):

1. `supabase db reset` — replay the full chain (`0001..NNNN`) onto a fresh local DB.
2. `npm run db:rebuild-snapshot` — dump that end state into `supabase/rebuild/0000_full_rebuild.sql`
   (the script re-derives the `0001..NNNN` marker the CI check parses).
3. `git diff supabase/rebuild/0000_full_rebuild.sql` — review, then commit it **alongside** the migration.

If you cannot run a local DB, the migration is **not ready to merge**: the snapshot would
drift and the freshness gate would block the next PR. Regeneration needs the Supabase CLI +
local Postgres.

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
4. the rebuild snapshot has been regenerated in this same change whenever the migration
   advanced the chain head (§5) — this is a hard requirement now that the freshness check
   blocks CI, not an "if needed"
