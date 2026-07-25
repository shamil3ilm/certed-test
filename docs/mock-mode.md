# Mock Mode

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
- `student@mock.test`
- `student2@mock.test`

Default password:

- `cert-ed`

## How login works

In mock mode, the login page shows the dev login flow and demo account list.

It does not use live OAuth.

## Local files used by mock mode

- `.mock-db.json`
- `.mock-storage/`

Resetting those local artifacts returns the app to the seed state.

## Important limitations

1. Mock mode does not enforce real database RLS.
2. Mock mode is useful for workflow checks, not security proof.
3. Production and preview verification still need real Supabase-backed testing where access boundaries matter.

## Related code

- `src/lib/mock/seed.ts`
- `src/lib/mock/store.ts`
- `src/lib/mock/client.ts`
- `src/lib/mock/session.ts`

## Related docs

- [setup-guide.md](./setup-guide.md)
- [schema-reference.md](./schema-reference.md)
