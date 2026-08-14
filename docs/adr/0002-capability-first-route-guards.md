# 0002 — Capability-first route guards

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

Personas (admin, sub_admin, tutor, mentor, student) describe who a user is, but pages and API routes need to gate on what a user may _do_. Checking personas directly at every entry point couples UI access to identity and makes admin overrides awkward.

## Decision

Access is expressed as capabilities (`viewClasses`, `manageClassContent`, `viewFinance`, …) defined in `src/lib/capabilities`. A persona maps to a baseline capability set; per-user admin overrides can grant or deny individual capabilities on top. Pages call `requireCapability(...)`, API routes call `requireCapabilityApi(...)`, and the navigation is generated from the same resolved set — so the nav and the guards never drift.

Class-scoped authority (which specific class a user may touch) is a separate concern, handled by `canManageClass` / `canAccessClass` / `canWriteClass` and enforced again by RLS.

## Consequences

- Nav, page guards, and API guards all derive from one capability set.
- Admin overrides are additive and reversible without changing persona identity.
- Two questions must both be answered for class content: "has the capability?" and "in scope for this class?" — capability guard plus class guard.

## Follow-up work

- None. New features add a capability rather than a persona check.
