# Architecture implementation plan (status)

The phase-by-phase overhaul is essentially complete. The living, canonical rulebook is [architecture-rules.md](architecture-rules.md), and the current layout is mapped in [where-to-find-what.md](where-to-find-what.md). The full historical narrative — all phases, targets, and exit criteria — is archived at [archive/2026-08-13-architecture-overhaul.md](archive/2026-08-13-architecture-overhaul.md).

## Shipped

Standards baseline; shared-UI extraction into `src/lib/ui/*`; the data layer (`src/lib/data`); the domain split (`src/lib/services/<domain>`); auth / persona / capability consolidation; API and action transport standardization; and DB / RLS alignment.

## Still open

- **`src/features` feature-folder layer** — designed but never built; put new shared domain code in `src/lib/services/<domain>` for now.
- **`services` → `domain` rename** — deferred; keep using `src/lib/services`.

Until either is explicitly executed, follow the current layout, not the aspirational target.
