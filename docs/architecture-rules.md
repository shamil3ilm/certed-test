# Architecture rules

The enforceable, repo-specific architecture and layering rules that all new work and all touched files must follow. Cross-cutting good practice lives in [engineering-guidelines.md](engineering-guidelines.md); code style and naming in [application-standards.md](application-standards.md).

---

## 1. Canonical principles

1. The application must have one obvious home for each concern.
2. Route entry points must stay thin.
3. Raw database access must not be scattered.
4. Shared UI must not be mixed with business logic.
5. Authorization must be centralized and consistent across page, action, API, and RLS layers.
6. Repeated logic must be extracted before it becomes structural debt.
7. Documentation must reflect the real codebase, not a past phase.

---

## 2. Layer purposes

## 2.1 `src/app`

Allowed:

- Next.js route files
- route-local composition
- route-local transport adapters

Not allowed:

- raw Supabase queries
- shared design-system primitives
- reusable business workflows
- duplicated auth logic

## 2.2 `src/features`

> **Status: PLANNED - NOT IMPLEMENTED.** This layer does not exist yet. The code currently layers as `src/app -> src/lib/services -> src/lib/data`. The rules below are the intended contract for when/if the feature layer is introduced.

Allowed:

- feature-owned components
- feature-owned presentation helpers
- feature-local UI composition

Not allowed:

- raw database access
- cross-feature utility dumping

## 2.3 Domain orchestration layer

Current live home:

- `src/lib/services`

Target home after the architecture pass:

- `src/lib/domain`

Allowed:

- business rules
- workflows
- orchestration
- capability and persona decisions
- audit and side-effect coordination

Not allowed:

- route rendering
- direct dependency on route folders

## 2.4 `src/lib/data`

Allowed:

- raw Supabase reads
- raw Supabase writes
- RPC calls
- query shaping
- pagination and indexing-aware lookup logic

Not allowed:

- redirects
- UI shaping
- notification fan-out
- audit decisions
- page or feature imports

## 2.5 `src/lib/ui`

Allowed:

- reusable UI primitives
- shared display helpers
- shared layout patterns

Not allowed:

- domain imports
- data imports
- Supabase access

---

## 3. Import direction rules

Allowed direction:

1. `src/app -> src/features`
2. `src/app -> src/lib`
3. `src/features -> src/lib`
4. `src/lib/services` or `src/lib/domain` -> `src/lib/data`
5. `src/lib/services` or `src/lib/domain` -> `src/lib/validation`
6. `src/lib/services` or `src/lib/domain` -> `src/lib/api`
7. `src/lib/services` or `src/lib/domain` -> `src/lib/auth` and `src/lib/session` where appropriate

Forbidden direction:

1. `src/lib/* -> src/app/*`
2. `src/lib/data/* -> src/features/*`
3. `src/lib/ui/* -> src/lib/services/*` or `src/lib/domain/*`
4. `src/lib/ui/* -> src/lib/data/*`
5. `src/features/* -> raw Supabase client access`

Transitional rule:

1. Until the repo-wide rename is completed, `src/lib/services` is the active domain-orchestration layer.
2. Do not introduce a parallel `src/lib/domain` tree for new feature work until the migration plan explicitly starts that move.

---

## 4. Page, action, and API rules

## 4.1 Pages

Pages may:

- read params and search params
- call guard helpers
- call one or more well-named page loaders
- render
- redirect or notFound based on final outcome

Pages must not:

- call `.from()` or `.rpc()`
- implement business workflow logic
- duplicate permission logic already available in domain helpers

## 4.2 Server actions

Server actions may:

- parse form data
- call guard helpers
- call one domain command
- revalidate paths
- return shared action results

Server actions must not:

- contain domain rules inline
- invent local result shapes
- perform duplicated audit/notification logic

## 4.3 API routes

API routes may:

- parse request payload
- call API auth guards
- call one domain command or query
- return shared API responses

API routes must not:

- implement workflow rules inline
- bypass shared error-code conventions

---

## 5. Database access rules

1. All raw Supabase table access belongs in `src/lib/data/*`.
2. New domain workflows must call data-layer modules rather than inline queries.
3. Pages, layouts, and shared UI must never execute raw queries.
4. Service-role access must be explicit and justified.
5. Every hot-path query must be bounded and index-aware.
6. RLS must remain the database trust boundary even when app-layer guards exist.

## 5.1 Query construction rules

1. Query construction belongs in the data layer unless the repository has an explicitly documented exception.
2. Every query that can return multiple rows must define one of:
   - a hard limit
   - a page/range boundary
   - a small fixed result expectation that is obvious from the workflow
3. Queries used for pagination must use deterministic ordering.
4. Search and filter helpers must validate or escape user-supplied filter text before composing query predicates.
5. Count and summary workflows should prefer database-side aggregation or narrow select shapes over loading full row sets into application memory.
6. App-side merging of multiple unbounded query result sets is not allowed on production-facing hot paths.
7. If a query intentionally performs fan-out reads, the reason it cannot be consolidated should be clear and revisitable.
8. Query helpers should return normalized domain shapes or focused row shapes, not broad ad hoc payloads that each caller reshapes differently.
9. Data-layer query functions must make their access boundary clear:
   - RLS-scoped session read
   - service-role read
   - mixed workflow with documented compensating guard
10. Query helpers must not silently swallow partial failures from one branch of a multi-query workflow.

---

## 6. Authorization rules

1. `getActorContext()` is the canonical request actor loader.
2. Persona and capability resolution must not be reimplemented elsewhere.
3. Page access should prefer capability guards when capability semantics matter.
4. API access should use shared throwing guards.
5. Database admin authority must flow through shared helper functions, not duplicated logic.
6. Adding a new persona requires updates to:
   - capability mapping
   - nav behavior if applicable
   - route guards if applicable
   - tests
   - documentation
7. Global identity flags and scoped authority must not be conflated.
8. A helper named or documented as a global persona helper must not be used as proof of scoped authority.
9. If a module intentionally relies on caller-enforced permission checks, that exception must be stated clearly in the module contract.

---

## 7. Shared UI rules

1. Reusable UI primitives belong in `src/lib/ui/*`.
2. Route-group files must not become the shared design system. _Known exception:_ the form primitives in `src/app/(prt)/form.tsx` are a tracked pending migration into `src/lib/ui`.
3. Shared UI helpers must not encode domain rules.
4. If a UI pattern is reused across more than one feature, extract it.
5. User-facing copy must be readable ASCII unless a justified product requirement says otherwise.
6. A page may deep-import a specific `@/lib/ui/*` sub-module instead of the barrel where the barrel triggers the webpack client-reference-manifest omission — a commented, guarded workaround enforced by `scripts/check-client-manifest.mjs`. This is not a §7.1 violation (the target is still under `src/lib/ui`).

---

## 8. Naming and file rules

Owned by [application-standards.md](application-standards.md) §1–§2 — kebab-case libraries, PascalCase components, one concern per file, no vague `utils.ts`. That doc is authoritative for naming; this section intentionally does not restate the rules.

---

## 9. File size and complexity rules

The specific file-size and function-size limits are owned by [application-standards.md](application-standards.md) §2 (file size) and §4 (function size) — a file that crosses the top tier is architecture debt, a split-by-concern task, not a style nit. The complexity rules below stay here because they are structural, not stylistic:

### 9.1 Workflow branching thresholds

1. If one function handles more than 3 materially different workflows, split it.
2. If one module mixes query logic, authorization logic, mutation workflow, side effects, and UI shaping, it is structurally overloaded and must be split.

### 9.2 Dependency breadth rule

1. A module importing many unrelated domains should be reviewed as a likely layering problem.
2. If a single file imports auth, messaging, finance, permissions, notifications, and UI together, it likely owns too much behavior.

---

## 10. Extraction trigger rules

Extraction is required when any of the following becomes true:

1. The same workflow logic appears in 3 places.
2. The same transport parsing logic appears in 3 places.
3. A page contains more than simple loading and rendering behavior.
4. A service file grows into multiple distinct responsibilities.
5. A shared UI pattern is used in multiple features.

Recommended early extraction:

1. when duplication appears twice and is likely to recur
2. when a new persona would require touching multiple duplicated branches

---

## 11. Documentation rules

1. Architecture docs must match the live codebase.
2. README must not describe obsolete roles, schema phases, or folder structures.
3. Any architecture change that alters where code belongs must update the relevant docs in the same workstream.
4. Mojibake in docs is a defect.
5. Major architecture decisions should be recorded as short ADRs under `docs/adr/`.
6. Code comments are part of the architecture contract and must describe the live system rather than commit chronology.

---

## 12. Test rules

1. Permission changes require permission tests.
2. Workflow changes require workflow tests.
3. New domain modules require unit coverage where behavior is non-trivial.
4. E2E tests should verify critical user journeys, not internal implementation details.

---

## 13. Dependency and package rules

1. No new dependency should be added without a short written reason.
2. That reason should state:
   - what problem the dependency solves
   - why existing code or current dependencies are insufficient
   - expected runtime, bundle, and maintenance cost
3. Convenience alone is not enough justification for a new package in a core path.

---

## 14. Migration discipline rules

1. Every schema migration must be append-only.
2. Any migration that changes schema, RLS, helper functions, or access behavior must update the relevant docs in the same workstream.
3. Any migration that changes behavior must update tests or verification procedures in the same workstream.
4. Rebuild snapshots must reflect the end state of the migration chain.
5. Temporary SQL patches or one-off emergency fixes must be folded into the canonical migration story if they become part of the long-term system.

---

## 15. Side-effect rules

1. Notifications, audit writes, exports, and external integrations are domain side effects and must be explicit.
2. Side effects should not be buried inside unrelated helpers or UI-facing modules.
3. A mutation path should make its side effects discoverable from the command or service flow.
4. Lifecycle side effects such as persona sync, mentorship teardown, and notification fan-out must be documented when they are not symmetric on restore or replay.

---

## 16. View-model rules

1. Page loaders should return shaped view models where the UI needs more than a trivial raw row.
2. Raw persistence rows should not leak broadly into route rendering if a view-specific shape is more readable.
3. Display shaping belongs above the data layer.

---

## 17. Coding pattern rules

1. The preferred domain-module pattern is:
   - shared types
   - input validation
   - pure helper logic
   - query functions
   - command or mutation functions
   - transport adapters such as `...FromActionInput` or `...FromApiInput`
2. Validation should happen at the boundary before domain mutation logic runs.
3. Transport adapters should stay thin and should delegate to a named domain function rather than embedding workflow rules.
4. Query shaping and raw table access should live in `src/lib/data/*`, even when a broader service split is still being completed.
5. Permission checks should happen once at the correct boundary and then be reused, not recomputed ad hoc in multiple branches.
6. A domain file that mixes raw queries, authorization, orchestration, side effects, and UI shaping should be split by concern.
7. New work should follow existing split-domain patterns where available, such as `queries.ts`, `commands.ts`, `student-actions.ts`, or `grading.ts`, rather than extending oversized mixed-responsibility modules.
8. Comments in domain and data modules should focus on invariants, trust boundaries, lifecycle semantics, retry behavior, or caller contracts, not narrate refactor history.

---

## 18. Failure and fallback rules

1. Authorization, persona, capability, and policy-source reads must fail closed.
2. Silent fallback to empty arrays, false permissions, or partial access is not allowed for security-sensitive reads.
3. If a read cannot be trusted, the application should surface the failure rather than infer access from bad data.

---

## 19. Security rules

1. Authorization must be enforced at the narrowest meaningful boundary, not only at the page entry point.
2. Sensitive writes must verify the real target scope server-side and must not trust client-supplied relationship claims.
3. Service-role access must be used only where RLS alone cannot express the workflow, and each such use must document the compensating app-layer guard.
4. Security-sensitive reads and writes must not silently continue after partial query failure.
5. Admin-only and hard-rule operations must be explicit and must not become override-grantable by accident.
6. UI visibility must not be treated as authorization.
7. If a workflow depends on both app-layer checks and RLS, the two must be intentionally aligned and documented.
8. Any fallback mode, mock path, or operational shortcut must fail safe in production-facing code.

---

> **Cross-cutting engineering guidelines** — idempotency, observability, accessibility, concurrency, caching, privacy/retention, third-party/protocol/architecture-choice, and related good practice — live in [engineering-guidelines.md](engineering-guidelines.md). They complement these binding, repo-specific rules; the Review Checklist below spans both docs.

---

## 20. Review checklist

Every substantial change should be reviewed against these questions:

1. Is this file in the correct layer?
2. Is any raw DB access bypassing the data layer?
3. Is business logic leaking into a page, action, or UI component?
4. Is auth duplicated instead of reusing shared guards or persona helpers?
5. Is repeated logic being introduced instead of extracted?
6. Is the file or function now over the agreed complexity thresholds?
7. Does this change require docs or tests to be updated?
8. Does this change add a new dependency or side effect that needs explicit documentation?
9. Did this change introduce unreadable comments or copy?
10. Is the workflow retry-safe or explicitly non-idempotent by design?
11. Does restore, revoke, archive, or replay behavior remain coherent?
12. Do labels, counts, and permissions still match the live persona model?
13. Are observability and failure diagnosis good enough for this workflow in production?
14. Are accessibility, loading, and empty/error states still coherent?
15. Does this change preserve the chosen API style and architecture boundaries?
16. Is the CRUD or lifecycle contract explicit and coherent for this domain?
17. Are concurrency, caching, and retention implications understood and safe?
18. If this touches an external integration, are timeout, retry, and replay behaviors explicit?
19. Does the touched code follow the preferred coding pattern for its layer?
20. Was every touched screen verified for responsive behavior on mobile and desktop widths?
21. Do the touched comments explain the live system and current constraints instead of commit history or outdated phase context?

---

## 21. Immediate adoption rule

1. All new files must follow these rules.
2. All touched files must move closer to these rules.
3. Legacy exceptions may exist temporarily, but no new exception should be introduced without a documented reason.
4. If a file is a known hotspot, touching it should include structural cleanup when safe.

---

## 22. Enforcement plan

These rules should be enforced in three ways:

1. documentation
2. code review
3. tooling, where practical

Recommended tooling follow-up:

- ESLint import-boundary rules
- restricted imports for raw Supabase usage outside `src/lib/data`
- checks for route-layer misuse
- dependency review during PRs
- ADRs for major architecture choices

Until tooling is fully added, these written rules are the binding source of truth.
