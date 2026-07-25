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

## Current migration chain

The current chain runs from:

- `0001_foundation.sql`
- through `0029_notifications_readonly_content.sql`

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
- `0018`: messaging
- `0019` to `0021`: tutor rename, capability overrides, independent mentor role
- `0022` to `0024`: persona and self-read hardening
- `0025` and `0028`: messaging performance and direct-thread integrity
- `0026`: unified admin authority
- `0027` and `0029`: notifications and notification content hardening

## Related docs

- [../docs/schema-reference.md](../docs/schema-reference.md)
- [../docs/rls-policy-inventory.md](../docs/rls-policy-inventory.md)
- [../docs/persona-model.md](../docs/persona-model.md)
- [../docs/setup-guide.md](../docs/setup-guide.md)
