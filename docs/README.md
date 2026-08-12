# Documentation index

The map of every doc, grouped by purpose. Each topic has one **canonical owner** — the doc that is the source of truth; others link to it rather than restating it.

## Start here

- [../README.md](../README.md) — project overview and quickstart
- [setup-guide.md](setup-guide.md) — full local setup and the path to going live
- [mock-mode.md](mock-mode.md) — the keyless JSON-file mock stack for local dev and E2E
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — how to contribute and the CI gates

## Architecture and standards

- [architecture-rules.md](architecture-rules.md) — **canonical** binding architecture and layering rules
- [application-standards.md](application-standards.md) — code style and naming conventions (defers to architecture-rules on layering/query-safety)
- [architecture-implementation-plan.md](architecture-implementation-plan.md) — historical record of how the architecture was built
- [adr/README.md](adr/README.md) — architecture decision records (0001–0006)

## Schema and data

- [schema-reference.md](schema-reference.md) — **canonical** table-by-table reference (36 tables)
- [rls-policy-inventory.md](rls-policy-inventory.md) — RLS policy families to verify
- [fk-cascade-inventory.md](fk-cascade-inventory.md) — every foreign key and its `ON DELETE` behaviour
- [persona-model.md](persona-model.md) — personas, capabilities, and the fixed-identity model
- [workflow-invariants.md](workflow-invariants.md) — cross-cutting workflow invariants
- [messaging-design.md](messaging-design.md) — the messaging model
- [migration-checklist.md](migration-checklist.md) — the migration process and snapshot discipline
- [../supabase/README.md](../supabase/README.md) — migrations and the rebuild snapshot

## API

- [api-reference.md](api-reference.md) — every `/api` route and its guard

## Operations (production)

- [deployment.md](deployment.md) — provisioning and first deploy (Vercel + Supabase)
- [environment.md](environment.md) — **canonical** environment-variable reference
- [operations.md](operations.md) — day-2 runbook: backups, monitoring, incident response
- [production-checklist.md](production-checklist.md) — the go-live gate
- [security-operations.md](security-operations.md) — secret inventory and rotation

## Reference

- [brand-asset-reference.md](brand-asset-reference.md) — brand asset inventory

## Point-in-time audits (`qa/`)

Dated audit artifacts — snapshots of the codebase at a moment, not living references. The most recent is authoritative for status; older ones are history.

- [qa/](qa/)

## Archive (`archive/`)

Implemented plans and superseded designs, kept for their rationale.

- [archive/](archive/)
