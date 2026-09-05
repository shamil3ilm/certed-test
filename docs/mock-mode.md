# Mock mode

Mock mode lets you run the portal locally without a real Supabase project.

It is intended for:

- UI development
- persona journey checks
- local workflow iteration

It is not intended for:

- real RLS verification
- real authentication verification
- production-trust testing

## What mock mode does

Mock mode swaps the normal runtime integrations for the local mock harness in `src/lib/mock`.

That includes:

- auth/session simulation
- seeded data
- JSON-backed persistence
- local storage behavior for files used by the mock harness

## Current seeded accounts

Current seeded personas include:

- `admin@mock.test`
- `subadmin@mock.test`
- `tutor@mock.test`
- `mentor@mock.test`
- `tutormentor@mock.test` (hybrid tutor + mentor persona)
- `student@mock.test`
- `student2@mock.test`

Default password:

- `cert-ed`

## How login works

In mock mode, the login page shows the dev login flow and demo account list.

It does not use live OAuth.

## Local files used by mock mode

- `.mock-db.json`
- `.mock-db.lock`
- `.mock-storage/`

Resetting those local artifacts returns the app to the seed state.

### One writer at a time

`.mock-db.json` is a single file, rewritten wholesale on every mutation, so two mock
servers overwrite each other. The store claims `.mock-db.lock` by pid on first load and
REFUSES to start when another live process holds it.

That refusal is deliberate and worth understanding, because the alternative is much worse
than a crash: with two servers sharing the file, a test fails on rows it never created and
reports `strict mode violation: resolved to 2 elements` against its OWN fixture. That reads
like a duplicate-render bug and sends you into the component tree. A lock naming a dead pid
is stale and cleared automatically, so a hard kill never wedges the next run.

If a run refuses to start, the message names the holding pid - stop that process rather
than deleting the lock by hand.

## Important limitations

1. Mock mode does not enforce real database RLS.
2. Mock mode is useful for workflow checks, not security proof.
3. Production and preview verification still need real Supabase-backed testing where access boundaries matter.
4. Constraints are modelled only where their absence would MISLEAD. The store rejects a
   write that omits (or nulls) a NOT NULL column listed in `src/lib/mock/constraints.ts`,
   returning a PostgREST-shaped `23502` so callers hit the same error path as production.
   The list is short on purpose - foreign keys the app must resolve and attach, which a
   refactor drops - not every NOT NULL column, and a gate asserts the mock is never
   STRICTER than the migration chain, since that lies in the other direction.

## Related code

- `src/lib/mock/seed.ts`
- `src/lib/mock/store.ts`
- `src/lib/mock/client.ts`
- `src/lib/mock/session.ts`
- `src/lib/mock/constraints.ts` — the NOT NULL columns the store enforces
- `src/lib/mock/exclusive.ts` — the single-writer lock

## Related

- [setup-guide.md](./setup-guide.md)
- [schema-reference.md](./schema-reference.md)
