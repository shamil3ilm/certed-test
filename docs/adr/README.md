# Architecture Decision Records

This folder holds short Architecture Decision Records for major structural choices in the project.

## Purpose

Use an ADR when a change affects how the system is designed or how future contributors are expected to build on it.

Examples:

- introducing a `src/lib/data` layer
- changing the authorization model
- adopting a new messaging or notification pattern
- changing the database rebuild strategy
- introducing a caching or queueing model

## ADR format

Keep ADRs short and practical.

Recommended sections:

1. Title
2. Date
3. Status
4. Context
5. Decision
6. Consequences
7. Follow-up work

## Naming convention

Use a numbered kebab-case name, for example:

- `0001-adopt-data-layer.md`
- `0002-capability-first-route-guards.md`

## Rules

1. ADRs are for major decisions, not every implementation detail.
2. If a major architecture rule changes, add or update an ADR in the same workstream.
3. If an ADR is superseded, do not delete it. Mark it superseded and reference the replacement.
