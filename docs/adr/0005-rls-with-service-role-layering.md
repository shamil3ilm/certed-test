# 0005 — RLS-scoped reads by default, service-role for aggregation

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

Two Supabase clients are available: an RLS-scoped client bound to the signed-in user, and
a service-role client that bypasses RLS. Using the wrong one either leaks data (service
role where a user scope was needed) or returns empty results that read as "not found"
(RLS where a cross-user aggregate was needed).

## Decision

- `createClient()` (RLS-scoped) is the default for anything a user reads about themselves
  or their own classes. RLS is the security boundary; the app layer is defence in depth.
- `createAdminClient()` (service role) is used only for cross-user/cross-class aggregation
  and for writes that the service has already authorized, and such reads must first scope
  by the caller's own membership (e.g. `myClassIds`) so they never widen visibility.
- A row's existence check that must distinguish "absent" from "forbidden" uses the service
  role deliberately (an RLS read collapses both into an empty result).

## Consequences

- Every service-role call is a deliberate, reviewable choice, not a default.
- Analytics and messaging resolution can aggregate efficiently while staying scoped.

## Follow-up work

- Keep new aggregation queries scoped to the caller's membership before fanning out.
