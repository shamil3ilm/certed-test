# Architecture Rules

- Date: 2026-07-23
- Status: Active rule set
- Purpose: Define the enforceable architectural rules that all new work and all touched files must follow.

---

## 1. Canonical Principles

1. The application must have one obvious home for each concern.
2. Route entry points must stay thin.
3. Raw database access must not be scattered.
4. Shared UI must not be mixed with business logic.
5. Authorization must be centralized and consistent across page, action, API, and RLS layers.
6. Repeated logic must be extracted before it becomes structural debt.
7. Documentation must reflect the real codebase, not a past phase.

---

## 2. Layer Purposes

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

## 3. Import Direction Rules

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

## 4. Page, Action, and API Rules

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

## 4.2 Server Actions

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

## 4.3 API Routes

API routes may:

- parse request payload
- call API auth guards
- call one domain command or query
- return shared API responses

API routes must not:

- implement workflow rules inline
- bypass shared error-code conventions

---

## 5. Database Access Rules

1. All raw Supabase table access belongs in `src/lib/data/*`.
2. New domain workflows must call data-layer modules rather than inline queries.
3. Pages, layouts, and shared UI must never execute raw queries.
4. Service-role access must be explicit and justified.
5. Every hot-path query must be bounded and index-aware.
6. RLS must remain the database trust boundary even when app-layer guards exist.

## 5.1 Query Construction Rules

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

## 6. Authorization Rules

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

## 7. Shared UI Rules

1. Reusable UI primitives belong in `src/lib/ui/*`.
2. Route-group files must not become the shared design system.
3. Shared UI helpers must not encode domain rules.
4. If a UI pattern is reused across more than one feature, extract it.
5. User-facing copy must be readable ASCII unless a justified product requirement says otherwise.

---

## 8. Naming and File Rules

1. Shared library files use kebab-case.
2. React component files use PascalCase unless framework conventions require otherwise.
3. Folder names stay lower-case unless framework conventions require otherwise.
4. One file should have one primary concern.
5. Avoid vague names such as `utils.ts`, `helpers.ts`, or `common.ts` unless they are truly generic and stable.

---

## 9. File Size and Complexity Rules

These are architectural review thresholds, not vanity limits.

### 9.1 File size thresholds

1. Files above 250 lines should be reviewed for split opportunities.
2. Files above 400 lines must be justified or split by concern.
3. Files above 600 lines are architecture debt unless there is a strong, explicit reason to keep them intact.

### 9.2 Function size thresholds

1. Functions above roughly 40 to 60 lines of non-trivial logic should be reviewed for extraction.
2. Functions that require scrolling through multiple unrelated branches should be split even if they are below a numeric threshold.

### 9.3 Workflow branching thresholds

1. If one function handles more than 3 materially different workflows, split it.
2. If one module mixes query logic, authorization logic, mutation workflow, side effects, and UI shaping, it is structurally overloaded and must be split.

### 9.4 Dependency breadth rule

1. A module importing many unrelated domains should be reviewed as a likely layering problem.
2. If a single file imports auth, messaging, finance, permissions, notifications, and UI together, it likely owns too much behavior.

---

## 10. Extraction Trigger Rules

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

## 11. Documentation Rules

1. Architecture docs must match the live codebase.
2. README must not describe obsolete roles, schema phases, or folder structures.
3. Any architecture change that alters where code belongs must update the relevant docs in the same workstream.
4. Mojibake in docs is a defect.
5. Major architecture decisions should be recorded as short ADRs under `docs/adr/`.
6. Code comments are part of the architecture contract and must describe the live system rather than commit chronology.

---

## 12. Test Rules

1. Permission changes require permission tests.
2. Workflow changes require workflow tests.
3. New domain modules require unit coverage where behavior is non-trivial.
4. E2E tests should verify critical user journeys, not internal implementation details.

---

## 13. Dependency and Package Rules

1. No new dependency should be added without a short written reason.
2. That reason should state:
   - what problem the dependency solves
   - why existing code or current dependencies are insufficient
   - expected runtime, bundle, and maintenance cost
3. Convenience alone is not enough justification for a new package in a core path.

---

## 14. Migration Discipline Rules

1. Every schema migration must be append-only.
2. Any migration that changes schema, RLS, helper functions, or access behavior must update the relevant docs in the same workstream.
3. Any migration that changes behavior must update tests or verification procedures in the same workstream.
4. Rebuild snapshots must reflect the end state of the migration chain.
5. Temporary SQL patches or one-off emergency fixes must be folded into the canonical migration story if they become part of the long-term system.

---

## 15. Side-Effect Rules

1. Notifications, audit writes, exports, and external integrations are domain side effects and must be explicit.
2. Side effects should not be buried inside unrelated helpers or UI-facing modules.
3. A mutation path should make its side effects discoverable from the command or service flow.
4. Lifecycle side effects such as persona sync, mentorship teardown, and notification fan-out must be documented when they are not symmetric on restore or replay.

---

## 16. View-Model Rules

1. Page loaders should return shaped view models where the UI needs more than a trivial raw row.
2. Raw persistence rows should not leak broadly into route rendering if a view-specific shape is more readable.
3. Display shaping belongs above the data layer.

---

## 17. Coding Pattern Rules

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

## 18. Failure and Fallback Rules

1. Authorization, persona, capability, and policy-source reads must fail closed.
2. Silent fallback to empty arrays, false permissions, or partial access is not allowed for security-sensitive reads.
3. If a read cannot be trusted, the application should surface the failure rather than infer access from bad data.

---

## 19. Security Rules

1. Authorization must be enforced at the narrowest meaningful boundary, not only at the page entry point.
2. Sensitive writes must verify the real target scope server-side and must not trust client-supplied relationship claims.
3. Service-role access must be used only where RLS alone cannot express the workflow, and each such use must document the compensating app-layer guard.
4. Security-sensitive reads and writes must not silently continue after partial query failure.
5. Admin-only and hard-rule operations must be explicit and must not become override-grantable by accident.
6. UI visibility must not be treated as authorization.
7. If a workflow depends on both app-layer checks and RLS, the two must be intentionally aligned and documented.
8. Any fallback mode, mock path, or operational shortcut must fail safe in production-facing code.

---

## 20. Idempotency and Retry Rules

1. Every write path must declare whether it is create-only, idempotent, replace-style, or state-transition-based.
2. Retries must not create duplicate records, duplicate side effects, or divergent access state.
3. Upsert flows must be used intentionally, with documented conflict keys and expected replay behavior.
4. Multi-step mutations must define safe retry behavior for partial failure cases.
5. If a workflow cannot be made fully atomic, it must fail toward the safer access outcome and document that ordering.
6. Notification, audit, and export side effects must be checked for replay tolerance where user retries are possible.

---

## 21. Workflow and Logic Integrity Rules

1. Each workflow must have one authoritative command path for mutation.
2. Equivalent workflows across page, action, API, cron, and admin tooling must not implement conflicting business rules.
3. A workflow must model the full lifecycle where applicable:
   - create
   - view
   - update or correct
   - revoke, archive, or deactivate
   - restore or re-enable if supported
4. Restore behavior must be explicit; if restore is partial rather than full reconstruction, that must be intentional, documented, and visible in the UI where relevant.
5. Identity, capability, and scoped-relationship logic must not drift apart across modules.
6. Derived counts, labels, and summaries must reflect the live persona model, not obsolete role assumptions.

---

## 22. Consistency and Flow Rules

1. The same concept must use the same primary terminology across nav, page titles, widgets, admin tools, and docs unless a different label is intentionally justified.
2. A user-visible action should have a discoverable user-visible result path where the workflow expects one.
3. Admin-facing control surfaces must clearly distinguish:
   - identity
   - global permissions
   - scoped access
   - status or lifecycle state
4. UI affordances, route guards, API guards, and service rules must agree on what a user can do.
5. Hybrid persona states must be represented consistently across labels, counts, filters, and visual treatment.

---

## 23. Transitional-Code Rules

1. Temporary compatibility code must be marked as transitional.
2. Transitional code should state:
   - why it exists
   - what removes it
   - the intended removal phase or condition
3. Transitional paths must not silently become permanent architecture.

---

## 24. Performance Rules

1. Hot pages must use bounded query strategies.
2. Dashboard, inbox, attendance, and large list pages must avoid unnecessary fan-out reads.
3. If a fan-out pattern remains temporarily, it must be explicitly justified and tracked for removal.
4. Performance shortcuts must not bypass authorization or architectural boundaries.

---

## 25. Ownership and Archive Rules

1. Each major domain should have one obvious home.
2. Dead docs, dead test helpers, obsolete phase notes, and stale operational artifacts should be removed or moved to an explicit archive location.
3. Live folders should contain live references, not mixed historical debris.

---

## 26. Observability Rules

1. Critical workflows must emit enough logging and audit context to explain who acted, on what, and with what outcome.
2. Privileged mutations must be auditable even when downstream best-effort side effects fail.
3. User-visible failures in core flows should have a stable error code or traceable server log path.
4. Silent failure is not acceptable for auth, lifecycle, finance, or access-granting workflows.
5. Hot paths and sensitive flows should be identifiable in production through metrics, dashboards, or structured logs where practical.
6. Logs must not leak secrets, raw credentials, setup codes, or sensitive document payloads.

---

## 27. Secrets and Environment Rules

1. Secrets must be read only from server-side environment variables or approved secret stores.
2. Secrets must never be exposed to client bundles unless they are explicitly public by platform convention.
3. Required environment variables must be validated at startup or at first controlled entry, not discovered through random runtime failure.
4. Environment variable names should be stable, documented, and scoped by purpose.
5. Debug or local fallback behavior must never weaken production secret handling.

---

## 28. Accessibility Rules

1. Interactive UI must remain keyboard reachable and operable.
2. Focus state must stay visible for all primary controls.
3. Semantics must be preserved for headings, forms, lists, tables, buttons, dialogs, and navigation.
4. Color alone must not carry essential meaning.
5. Empty, loading, error, and success states must remain understandable to assistive technologies.
6. Shared UI changes must preserve contrast, labels, and focus behavior across consuming screens.
7. Responsive layout changes must not break keyboard reachability, focus order, or semantic structure on mobile widths.

---

## 29. Migration Execution Rules

1. Every production-facing migration sequence should define:
   - pre-run assumptions
   - execution order
   - post-run verification
2. One-off hotfix SQL must be reconciled into the canonical migration story if it becomes part of the long-term state.
3. Data migrations that alter access, personas, lifecycle, or finance behavior require explicit verification queries.
4. Migration docs must state whether rollback is practical, partial, or not supported.
5. Rebuild snapshots and live migrations must describe the same intended end state.

---

## 30. Test Threshold Rules

1. Auth, RBAC, persona, and lifecycle changes require at least one targeted regression test.
2. Finance, notifications, and access-granting workflows require focused verification before merge.
3. New behavior on a critical user journey should have either:
   - unit coverage for the decision logic
   - integration coverage for the workflow
   - E2E coverage for the persona journey
4. If no automated test is added, the manual verification steps must be written down in the workstream.

---

## 31. State-Transition Rules

1. Lifecycle and status fields must have explicit allowed transitions.
2. Invalid transitions must fail explicitly rather than being silently ignored.
3. Transitions that revoke access must take effect before or with any dependent cleanup that could otherwise leave stale access behind.
4. Restore flows must document whether they reconstruct the prior state fully, partially, or minimally.
5. Counts, dashboards, and filters must treat active, pending, disabled, archived, voided, and inactive states consistently.

---

## 32. Background and Async Rules

1. Background, scheduled, and best-effort side effects must declare whether failure is acceptable or blocking.
2. Best-effort work must not be the only place a critical state change is recorded.
3. Async retries must be replay-safe or explicitly deduplicated.
4. Scheduled jobs and admin-triggered background paths must use the same domain rules as interactive mutations where the business meaning is the same.

---

## 33. Concurrency and Locking Rules

1. Critical write workflows must account for concurrent submissions, retries, and stale reads.
2. If two actors can plausibly change the same record at once, the workflow must define which write wins and why.
3. Duplicate-submit protection should exist for user-triggered mutations where double-clicks or network retries are realistic.
4. Concurrency-sensitive workflows should prefer database-backed guarantees, version checks, or explicit conflict handling over timing assumptions.
5. Race-condition handling must be documented where stale access, duplicate records, or incorrect status transitions are possible.

---

## 34. Caching Rules

1. Cache use must preserve authorization correctness and lifecycle freshness.
2. Permission, persona, and status-derived data must not be cached beyond a safe request or invalidation boundary without explicit reasoning.
3. Cached read models must define how they are invalidated after writes.
4. Performance caching must not serve stale access grants or stale revoked state.
5. Shared caches must not mix tenant-, user-, or persona-scoped data without an explicit keying strategy.

---

## 35. Privacy and Data Retention Rules

1. Personal data should be collected, exposed, and retained only to the extent required by the product workflow.
2. Logs, audit records, exports, and debugging helpers must avoid leaking sensitive personal or financial data unnecessarily.
3. Retention-sensitive workflows should define whether data is archived, redacted, retained, or deleted.
4. Developer tooling and mock data must not normalize unsafe handling of real user data.
5. Data export, report generation, and admin views should expose only the fields needed for the user’s authorized purpose.

---

## 36. Versioning and Compatibility Rules

1. API and schema changes must define their compatibility expectations explicitly.
2. Breaking contract changes must not be introduced silently across active clients or workflows.
3. Transitional compatibility layers must define removal conditions and must not become permanent without review.
4. Migration-era compatibility code must stay aligned with the documented end state.
5. Versioning decisions for APIs, snapshots, or long-lived integrations should be recorded in docs or ADRs when they affect maintenance.

---

## 37. Third-Party Integration Rules

1. External integrations must be isolated behind adapter or gateway boundaries.
2. Integration code must define timeout, retry, and failure behavior explicitly.
3. Third-party outages must fail safely and must not corrupt core local state.
4. Webhook, export, import, and callback flows must validate source, payload shape, and replay behavior.
5. Credentials, tokens, and provider-specific logic must not leak across unrelated domains.

---

## 38. CRUD and Lifecycle Rules

1. Every table-backed domain must have an explicit lifecycle model, not an implied CRUD assumption.
2. For each major domain, the system should define who may:
   - create
   - read
   - update or correct
   - archive, revoke, deactivate, or void
   - restore or re-enable if supported
3. Business records should prefer reversible lifecycle operations over hard delete unless the record is purely technical cleanup.
4. Hard delete must be rare, justified, and safe to retry.
5. Bulk CRUD operations must have explicit validation, authorization, and replay behavior.
6. Read models and write commands must stay conceptually separate even when they share a module.

---

## 39. API Style and Contract Rules

1. The default external API style for this application is REST.
2. Resource paths, verbs, status codes, pagination, and error envelopes must be consistent across REST endpoints.
3. RPC-style endpoints are allowed only when the action is truly command-oriented and not a natural resource mutation.
4. Competing API styles must not be mixed casually within the same product surface.
5. API responses should use shared success and error shapes where the client benefits from predictable handling.
6. API contracts must model lifecycle semantics explicitly rather than hiding archive, restore, or void behavior behind vague update calls.

---

## 40. Protocol and Integration Rules

1. SOAP must not be introduced unless required by a third-party integration that cannot be served by the existing stack.
2. If SOAP is required, it must be isolated behind a dedicated adapter boundary rather than leaking through the application layers.
3. GraphQL must not be introduced unless a proven cross-client aggregation problem justifies the added complexity.
4. gRPC is not the default app-integration protocol for this repository and should be considered only for explicit internal service-to-service needs.
5. MQTT, AMQP, or similar messaging infrastructure must not be introduced as a replacement for normal request-response CRUD APIs.
6. New protocols or integration paradigms require an ADR with the problem statement, tradeoffs, and scope of adoption.

---

## 41. Architecture Choice Rules

1. The default architecture for this repository is a modular monolith.
2. New architectural patterns must solve a proven present problem, not a hypothetical future scale problem.
3. Microservices, event buses, GraphQL gateways, CQRS, or event-sourcing must not be introduced without explicit documented justification.
4. Architectural complexity must remain proportional to team size, operational maturity, and real product needs.
5. New infrastructure should be isolated behind clear domain or adapter boundaries so it can be reasoned about locally.

---

## 42. Deprecation Rules

1. Deprecated files, helpers, routes, and transitional branches must be marked clearly.
2. Deprecation notes should state:
   - replacement path
   - removal condition
   - reason the old path still exists
3. Deprecated paths must not continue receiving new feature work.
4. Long-lived deprecations should be tracked in architecture or migration planning docs until removed.

---

## 43. UX Consistency Rules

1. Shared empty-state, loading-state, and error-state patterns should be reused rather than reinvented.
2. Similar workflows should present similar CTA placement and action naming where practical.
3. Dashboard cards, admin summaries, and list labels must use the current persona model rather than obsolete role terminology.
4. A user should not need to guess whether an item is clickable, view-only, or actionable.
5. Copy should distinguish clearly between:
   - identity
   - permissions
   - status
   - relationship-based access
6. Every touched screen must be verified at both narrow mobile and standard desktop widths.
7. Responsive behavior must be intentional for tables, filters, dashboards, forms, dialogs, and navigation.
8. Small-screen layouts must preserve the primary task flow instead of hiding essential actions behind accidental overflow or clipped regions.
9. If a dashboard card, list item, or summary block looks actionable, its click behavior must be explicit and consistent.

---

## 44. Review Checklist

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

## 45. Immediate Adoption Rule

1. All new files must follow these rules.
2. All touched files must move closer to these rules.
3. Legacy exceptions may exist temporarily, but no new exception should be introduced without a documented reason.
4. If a file is a known hotspot, touching it should include structural cleanup when safe.

---

## 46. Enforcement Plan

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
