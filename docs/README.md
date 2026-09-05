# Documentation index

The map of every doc, grouped by purpose. Each topic has one **canonical owner** — the doc that is the source of truth; others link to it rather than restating it.

## Start here

- [../README.md](../README.md) — project overview and quickstart
- [where-to-find-what.md](where-to-find-what.md) — orientation: where each layer and concern lives in the codebase
- [setup-guide.md](setup-guide.md) — run locally and the path to going live
- [mock-mode.md](mock-mode.md) — the keyless JSON-file mock stack for local dev and E2E
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — how to contribute, the CI gates, and the git hooks

## Architecture and standards

- [architecture-rules.md](architecture-rules.md) — **canonical** binding, repo-specific architecture and layering rules
- [engineering-guidelines.md](engineering-guidelines.md) — cross-cutting good-practice rules (idempotency, observability, accessibility, concurrency, …) that complement the binding rulebook
- [application-standards.md](application-standards.md) — **canonical** code style, naming, and file/function size thresholds
- [design-system.md](design-system.md) — **canonical** visual system: tokens, typography, and `@/lib/ui` primitives
- [content-pipeline.md](content-pipeline.md) — **canonical** marketing content: the structured copy modules and the MDX blog (how to add a post)
- [architecture-implementation-plan.md](architecture-implementation-plan.md) — status of the (mostly shipped) architecture overhaul
- [adr/README.md](adr/README.md) — architecture decision records (0001–0006)

## Schema and data

- [schema-reference.md](schema-reference.md) — **canonical** table-by-table reference (40 tables)
- [rls-policy-inventory.md](rls-policy-inventory.md) — RLS policy families to verify
- [fk-cascade-inventory.md](fk-cascade-inventory.md) — **canonical** foreign-key list and `ON DELETE` behaviour (owns the FK count)
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

## Debugging

- [troubleshooting.md](troubleshooting.md) — developer symptom → cause → fix (build, mock mode, RLS, Drive, E2E)

## Reference

- [brand-asset-reference.md](brand-asset-reference.md) — brand asset inventory

## Point-in-time audits (`qa/`)

Dated audit artifacts — snapshots of the codebase at a moment, not living references. The most recent is authoritative for status; older ones are history.

- [qa/](qa/)

## Archive (`archive/`)

Implemented plans and superseded designs, kept for their rationale.

- [archive/](archive/)
