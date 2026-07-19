# Database SQL — authority model

There are two SQL surfaces here. They have **different jobs** and one is
authoritative:

| Path | Role | Authoritative? |
|------|------|----------------|
| `migrations/*.sql` | Sequential, append-only upgrade path. Applied in order to move any existing environment forward. | **Yes — source of truth.** |
| `rebuild/0000_full_rebuild.sql` | Single-run fresh-build snapshot: the end state of applying `0001..NNNN` at once, for standing up a brand-new database. | No — derived snapshot. |

## Rules

1. **Every schema/RLS/function change starts as a new numbered migration** in
   `migrations/`. Never change the meaning of an already-applied migration.
2. **The rebuild file is kept in sync with migrations, not hand-designed.** When
   you add a migration, update `rebuild/0000_full_rebuild.sql` to match the new
   end state (it is currently maintained by hand — treat it as generated output,
   not a place to introduce schema that isn't in a migration).
3. **A fresh build must equal the migrated end state.** After applying migrations
   to a scratch DB and, separately, running the rebuild file on another scratch
   DB, `pg_policies`, tables, columns, functions and indexes should match. See
   `docs/rls-policy-inventory.md` for the expected policy set and
   `scripts/verify-migrations.ts` for the table/persona checks.

## Identity vs authorization (settled model)

- `profiles.role` is the account's **fixed identity** (`admin` / `sub_admin` /
  `teacher` / `student`), set at creation. It is **not** a transitional or
  compatibility field, and it is not reassigned in normal operation.
- `persona_assignments` is the **authorization** model. Global personas are kept
  in sync with `profiles.role` by trigger; scoped personas (e.g.
  `mentor`-for-a-student) come from their own tables (`mentorships`).

## Current chain

`0001`–`0017` (17 migrations). Persona model: `0014` table, `0015` populate,
`0016` helper functions, `0017` RLS hardening. See
`docs/schema-reference.md`.
