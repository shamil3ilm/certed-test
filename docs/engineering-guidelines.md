# Engineering guidelines

Cross-cutting good-practice rules that apply broadly across the codebase. They complement — and are subordinate to — the binding, repo-specific rulebook in [architecture-rules.md](architecture-rules.md): where the two ever conflict, architecture-rules wins. Grouped by concern; treat them as review defaults.

---

## 1. Idempotency and retry rules

1. Every write path must declare whether it is create-only, idempotent, replace-style, or state-transition-based.
2. Retries must not create duplicate records, duplicate side effects, or divergent access state.
3. Upsert flows must be used intentionally, with documented conflict keys and expected replay behavior.
4. Multi-step mutations must define safe retry behavior for partial failure cases.
5. If a workflow cannot be made fully atomic, it must fail toward the safer access outcome and document that ordering.
6. Notification, audit, and export side effects must be checked for replay tolerance where user retries are possible.

---

## 2. Workflow and logic integrity rules

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

## 3. Consistency and flow rules

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

## 4. Transitional-code rules

1. Temporary compatibility code must be marked as transitional.
2. Transitional code should state:
   - why it exists
   - what removes it
   - the intended removal phase or condition
3. Transitional paths must not silently become permanent architecture.

---

## 5. Performance rules

1. Hot pages must use bounded query strategies.
2. Dashboard, inbox, attendance, and large list pages must avoid unnecessary fan-out reads.
3. If a fan-out pattern remains temporarily, it must be explicitly justified and tracked for removal.
4. Performance shortcuts must not bypass authorization or architectural boundaries.

---

## 6. Ownership and archive rules

1. Each major domain should have one obvious home.
2. Dead docs, dead test helpers, obsolete phase notes, and stale operational artifacts should be removed or moved to an explicit archive location.
3. Live folders should contain live references, not mixed historical debris.

---

## 7. Observability rules

1. Critical workflows must emit enough logging and audit context to explain who acted, on what, and with what outcome.
2. Privileged mutations must be auditable even when downstream best-effort side effects fail.
3. User-visible failures in core flows should have a stable error code or traceable server log path.
4. Silent failure is not acceptable for auth, lifecycle, finance, or access-granting workflows.
5. Hot paths and sensitive flows should be identifiable in production through metrics, dashboards, or structured logs where practical.
6. Logs must not leak secrets, raw credentials, setup codes, or sensitive document payloads.

---

## 8. Secrets and environment rules

1. Secrets must be read only from server-side environment variables or approved secret stores.
2. Secrets must never be exposed to client bundles unless they are explicitly public by platform convention.
3. Required environment variables must be validated at startup or at first controlled entry, not discovered through random runtime failure.
4. Environment variable names should be stable, documented, and scoped by purpose.
5. Debug or local fallback behavior must never weaken production secret handling.

---

## 9. Accessibility rules

1. Interactive UI must remain keyboard reachable and operable.
2. Focus state must stay visible for all primary controls.
3. Semantics must be preserved for headings, forms, lists, tables, buttons, dialogs, and navigation.
4. Color alone must not carry essential meaning.
5. Empty, loading, error, and success states must remain understandable to assistive technologies.
6. Shared UI changes must preserve contrast, labels, and focus behavior across consuming screens.
7. Responsive layout changes must not break keyboard reachability, focus order, or semantic structure on mobile widths.

---

## 10. Migration execution rules

1. Every production-facing migration sequence should define:
   - pre-run assumptions
   - execution order
   - post-run verification
2. One-off hotfix SQL must be reconciled into the canonical migration story if it becomes part of the long-term state.
3. Data migrations that alter access, personas, lifecycle, or finance behavior require explicit verification queries.
4. Migration docs must state whether rollback is practical, partial, or not supported.
5. Rebuild snapshots and live migrations must describe the same intended end state.

---

## 11. Test threshold rules

1. Auth, RBAC, persona, and lifecycle changes require at least one targeted regression test.
2. Finance, notifications, and access-granting workflows require focused verification before merge.
3. New behavior on a critical user journey should have either:
   - unit coverage for the decision logic
   - integration coverage for the workflow
   - E2E coverage for the persona journey
4. If no automated test is added, the manual verification steps must be written down in the workstream.

---

## 12. State-transition rules

1. Lifecycle and status fields must have explicit allowed transitions.
2. Invalid transitions must fail explicitly rather than being silently ignored.
3. Transitions that revoke access must take effect before or with any dependent cleanup that could otherwise leave stale access behind.
4. Restore flows must document whether they reconstruct the prior state fully, partially, or minimally.
5. Counts, dashboards, and filters must treat active, pending, disabled, archived, voided, and inactive states consistently.

---

## 13. Background and async rules

1. Background, scheduled, and best-effort side effects must declare whether failure is acceptable or blocking.
2. Best-effort work must not be the only place a critical state change is recorded.
3. Async retries must be replay-safe or explicitly deduplicated.
4. Scheduled jobs and admin-triggered background paths must use the same domain rules as interactive mutations where the business meaning is the same.

---

## 14. Concurrency and locking rules

1. Critical write workflows must account for concurrent submissions, retries, and stale reads.
2. If two actors can plausibly change the same record at once, the workflow must define which write wins and why.
3. Duplicate-submit protection should exist for user-triggered mutations where double-clicks or network retries are realistic.
4. Concurrency-sensitive workflows should prefer database-backed guarantees, version checks, or explicit conflict handling over timing assumptions.
5. Race-condition handling must be documented where stale access, duplicate records, or incorrect status transitions are possible.

---

## 15. Caching rules

1. Cache use must preserve authorization correctness and lifecycle freshness.
2. Permission, persona, and status-derived data must not be cached beyond a safe request or invalidation boundary without explicit reasoning.
3. Cached read models must define how they are invalidated after writes.
4. Performance caching must not serve stale access grants or stale revoked state.
5. Shared caches must not mix tenant-, user-, or persona-scoped data without an explicit keying strategy.

---

## 16. Privacy and data retention rules

1. Personal data should be collected, exposed, and retained only to the extent required by the product workflow.
2. Logs, audit records, exports, and debugging helpers must avoid leaking sensitive personal or financial data unnecessarily.
3. Retention-sensitive workflows should define whether data is archived, redacted, retained, or deleted.
4. Developer tooling and mock data must not normalize unsafe handling of real user data.
5. Data export, report generation, and admin views should expose only the fields needed for the user's authorized purpose.

---

## 17. Versioning and compatibility rules

1. API and schema changes must define their compatibility expectations explicitly.
2. Breaking contract changes must not be introduced silently across active clients or workflows.
3. Transitional compatibility layers must define removal conditions and must not become permanent without review.
4. Migration-era compatibility code must stay aligned with the documented end state.
5. Versioning decisions for APIs, snapshots, or long-lived integrations should be recorded in docs or ADRs when they affect maintenance.

---

## 18. Third-party integration rules

1. External integrations must be isolated behind adapter or gateway boundaries.
2. Integration code must define timeout, retry, and failure behavior explicitly.
3. Third-party outages must fail safely and must not corrupt core local state.
4. Webhook, export, import, and callback flows must validate source, payload shape, and replay behavior.
5. Credentials, tokens, and provider-specific logic must not leak across unrelated domains.

---

## 19. CRUD and lifecycle rules

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

## 20. API style and contract rules

1. The default external API style for this application is REST.
2. Resource paths, verbs, status codes, pagination, and error envelopes must be consistent across REST endpoints.
3. RPC-style endpoints are allowed only when the action is truly command-oriented and not a natural resource mutation.
4. Competing API styles must not be mixed casually within the same product surface.
5. API responses should use shared success and error shapes where the client benefits from predictable handling.
6. API contracts must model lifecycle semantics explicitly rather than hiding archive, restore, or void behavior behind vague update calls.

---

## 21. Protocol and integration rules

1. SOAP must not be introduced unless required by a third-party integration that cannot be served by the existing stack.
2. If SOAP is required, it must be isolated behind a dedicated adapter boundary rather than leaking through the application layers.
3. GraphQL must not be introduced unless a proven cross-client aggregation problem justifies the added complexity.
4. gRPC is not the default app-integration protocol for this repository and should be considered only for explicit internal service-to-service needs.
5. MQTT, AMQP, or similar messaging infrastructure must not be introduced as a replacement for normal request-response CRUD APIs.
6. New protocols or integration paradigms require an ADR with the problem statement, tradeoffs, and scope of adoption.

---

## 22. Architecture choice rules

1. The default architecture for this repository is a modular monolith.
2. New architectural patterns must solve a proven present problem, not a hypothetical future scale problem.
3. Microservices, event buses, GraphQL gateways, CQRS, or event-sourcing must not be introduced without explicit documented justification.
4. Architectural complexity must remain proportional to team size, operational maturity, and real product needs.
5. New infrastructure should be isolated behind clear domain or adapter boundaries so it can be reasoned about locally.

---

## 23. Deprecation rules

1. Deprecated files, helpers, routes, and transitional branches must be marked clearly.
2. Deprecation notes should state:
   - replacement path
   - removal condition
   - reason the old path still exists
3. Deprecated paths must not continue receiving new feature work.
4. Long-lived deprecations should be tracked in architecture or migration planning docs until removed.

---

## 24. UX consistency rules

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

## Related

- [architecture-rules.md](architecture-rules.md) — the binding architecture and layering rules
- [application-standards.md](application-standards.md) — code style, naming, and size thresholds
