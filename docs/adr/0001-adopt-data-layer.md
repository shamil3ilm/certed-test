# 0001 — Adopt a `src/lib/data` access layer

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

Database access was at risk of spreading across services, page loaders, and route
handlers. Mixing SQL/PostgREST calls with business logic makes RLS scope hard to reason
about and makes it easy to run an unbounded query (no `LIMIT`, no tenant filter) from a
hot path.

## Decision

All table access lives in `src/lib/data/*`. Each function is a thin, typed query with an
explicit column projection and returns plain rows. Business rules, permission checks, and
auditing live one layer up in `src/lib/services/*`; page shaping lives in
`src/lib/services/page-data/*`. Services depend on the data layer, never the reverse.

## Consequences

- One place to audit every query for scope, projection, and bounds.
- Services stay testable by mocking the data module rather than the Supabase client.
- A small amount of boilerplate per query, accepted for the clarity it buys.

## Follow-up work

- Keep RLS-scoped reads (`createClient`) and service-role reads (`createAdminClient`)
  visibly distinct at the call site — see [0005](0005-rls-with-service-role-layering.md).
