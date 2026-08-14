# Database SQL

This folder contains the database source material for the application.

There are two SQL surfaces here, with different responsibilities:

| Path                            | Purpose                                                   | Authoritative               |
| ------------------------------- | --------------------------------------------------------- | --------------------------- |
| `migrations/*.sql`              | Sequential upgrade path for real environments             | Yes                         |
| `rebuild/0000_full_rebuild.sql` | Single-run fresh-build snapshot of the intended end state | No, derived from migrations |

## Source of truth

The source of truth is always:

- `supabase/migrations`

Never change the meaning of an already-applied migration.

## Regenerating the rebuild snapshot

`rebuild/0000_full_rebuild.sql` is a `pg_dump` of the fully migrated schema, not a hand-maintained file. Regenerate it after adding migrations, from a database that has the whole chain applied:

```bash
supabase db reset
npm run db:rebuild-snapshot
```

Then commit the snapshot alongside the migrations it reflects.

## Current migration chain

The chain starts at `0001_foundation.sql`. The current end is always the highest-numbered file in this directory.

## Current identity and authorization model

Identity:

- `profiles.role` is the fixed account identity
- current role values:
  - `admin`
  - `sub_admin`
  - `tutor`
  - `mentor`
  - `student`

Authorization:

- `persona_assignments` is the authorization model
- global personas are kept aligned with the fixed identity model
- scoped personas are used for relationship-based access such as mentorship
- capability overrides layer on top of persona defaults

## Important rules

1. Every schema, RLS, helper-function, or index change must start as a new numbered migration.
2. The rebuild SQL must be updated to reflect the end state of the migration chain.
3. RLS and helper functions must stay consistent with the app-layer capability and persona model.
4. Verification docs must be updated when policies or schema change.

## Current notable migration groups

- `0014` to `0017`: persona model introduction and hardening
- `0018` to `0024`: messaging, capability overrides, mentor support, and authorization hardening
- `0025` to `0034`: persona uniqueness, atomic assignment edits, hot-path indexes, schema consistency, and RPC hardening
- `0035` to `0044`: assignment deadline enforcement, mentor/class authority, messaging activity hardening, comments, and announcement attachments
- `0045` to `0051`: document management, attendance working hours, document versions, shared rate limits, audit indexing, and notification retention
- `0052` to `0055`: one-active-student enforcement, session feedback, tags, and tag-entity RLS hardening
- `0056` to `0060`: admin-managed multi-currency conversion, custodial attachment storage, the pending-emails delivery queue, audit-log retention, and per-slot timetable timezones

## Related

- [../docs/schema-reference.md](../docs/schema-reference.md)
- [../docs/rls-policy-inventory.md](../docs/rls-policy-inventory.md)
- [../docs/persona-model.md](../docs/persona-model.md)
- [../docs/setup-guide.md](../docs/setup-guide.md)
