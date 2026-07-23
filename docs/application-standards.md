# Application Standards

- Date: 2026-07-23
- Status: Active baseline
- Purpose: Define the default structural and coding standards that all ongoing overhaul work must follow.

Related references:

- `docs/architecture-rules.md` - binding architecture and layering rules
- `docs/architecture-implementation-plan.md` - implementation roadmap for the architecture pass

---

## 1. File Paths

1. Route files must use Next.js conventions only where required: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`.
2. Shared library files under `src/lib/` must use kebab-case file names, for example `actor-context.ts`, `calendar-events.ts`, `rate-limit.ts` (unified with the kebab-case app-layer helpers; the module's exported symbols stay camelCase).
3. React component files outside route conventions must use PascalCase file names, for example `PortalHeader.tsx`, `SubmitForm.tsx`.
4. Folder names must stay lower-case unless a framework convention requires otherwise.
5. Until the architecture rename phase is explicitly executed, new shared domain orchestration should prefer `src/lib/services/<domain>.ts` or `src/lib/services/<area>/<domain>.ts` instead of scattering helpers into pages.

## 2. File Naming Convention

1. One file should own one primary concern.
2. Avoid vague names such as `utils.ts`, `helpers.ts`, or `common.ts` unless the scope is truly generic and stable.
3. Use domain-specific names for service modules, for example `class-attendance.ts` instead of generic loader names.
4. Action files should be named for their transport role, for example `actions.ts`, `manage-actions.ts`, `submit-actions.ts`, until the route structure is simplified further.
5. Files above 250 lines should be reviewed for splitting; files above 400 lines should usually be split by concern unless there is a clear reason not to.

## 3. Coding Pattern

1. Pages, route handlers, and server actions must stay thin.
2. Business rules, validation, normalization, permission checks, and audit writes belong in services.
3. Shared transport behavior must use shared helpers instead of local JSON/result shapes.
4. Repeated parsing or orchestration should be promoted into a shared helper once it appears in more than one surface.
5. Comments must be plain ASCII unless the file already has a justified Unicode requirement.
6. Side effects such as notifications, audit writes, and external calls should stay explicit in the domain flow rather than being buried in unrelated helpers.
7. Security-sensitive logic must prefer fail-closed behavior over permissive fallback.
8. Workflow code must make retry behavior and idempotency obvious from the implementation.
9. Code that depends on status transitions, lifecycle state, or restore semantics should name and document those assumptions explicitly.
10. CRUD and lifecycle behavior should be explicit in code and naming, not inferred from generic update or delete helpers.
11. Concurrency-sensitive code should make its conflict or replay strategy obvious.
12. Cache-sensitive code should document its invalidation or freshness expectations when they are not trivial.
13. Preferred module order is:

- types
- schemas and validation
- pure helpers
- query functions
- command functions
- transport adapters

14. New code should follow an existing split pattern where the domain already has one, rather than extending a large mixed-responsibility file.
15. Within a function or module, separate validation, authorization, reads, writes, and response shaping with visible whitespace instead of dense uninterrupted blocks.
16. Inline comments should explain non-obvious code intent, invariants, or caveats, not commit history or obvious statements.
17. Touched UI code must preserve responsive behavior across narrow mobile and standard desktop widths.
18. Comments must describe the current codebase behavior, system rule, workflow constraint, or architectural reason, not the story of a past commit or temporary implementation phase.

## 4. Methods

1. Service methods should use verb-first names: `listProfilesByRole`, `createEventFromApiInput`, `markAttendance`.
2. Validation helpers should use `validate...` names.
3. Action/route adapter helpers should use `...FromActionInput` or `...FromApiInput` names.
4. Boolean helpers should use `is...`, `has...`, or `can...`.
5. Functions above roughly 40-60 lines of non-trivial logic should be reviewed for extraction.
6. Functions handling more than 3 materially different workflows should be split.
7. Methods that mutate state should reveal their lifecycle semantics clearly, for example `assign...`, `restore...`, `archive...`, `void...`, `replace...`, `set...`.
8. If a method is intentionally idempotent or replay-safe, its implementation and comments should make that clear.
9. Route and API helpers should preserve the chosen transport style consistently instead of mixing unrelated paradigms ad hoc.

## 5. Query Pattern

1. Query functions should use read-oriented names such as `list...`, `get...`, `find...`, `count...`, `summarize...`, or `load...`.
2. Query helpers must state scope in naming when it matters, for example `listMyReminders`, `getClassMembers`, `listRecentDocs`, or `countUsersHubStats`.
3. Unbounded reads are not allowed on hot paths. If a query can grow with production data, it must declare a limit, range, page, cursor, or intentionally small result set.
4. Default ordering must be explicit when callers rely on recency, chronology, priority, or deterministic pagination.
5. Query helpers should return stable normalized shapes rather than leaking inconsistent raw row structures broadly into calling code.
6. Search helpers must escape or validate search input before building query filters.
7. Query code should avoid app-side fan-out when one bounded query or database-side aggregation can express the same result safely.
8. Count, summary, and existence checks should prefer narrow select shapes, head counts, or database-side aggregation over fetching full rows.
9. If a query intentionally relies on RLS scoping, that contract should be clear from its placement and caller expectations.
10. If a query intentionally bypasses RLS through service-role access, the compensating app-layer guard must be obvious from the surrounding workflow.

## 6. Variables

1. Use lower camel case for variables and function parameters.
2. Prefer explicit domain names over abbreviations unless the abbreviation is already standard in the file.
3. Request actor variables should default to `me` for authenticated action/route flows and `actor` for service-layer parameters.
4. Avoid one-letter names except for short callback parameters with obvious local meaning.

## 7. Formatting and Layout

1. Follow the repository formatter and lint rules as the source of truth for indentation, spacing, quotes, trailing commas, and line wrapping.
2. Do not manually introduce formatting that fights the formatter output.
3. Keep one blank line between materially different logical blocks, for example validation, authorization, query, mutation, and response shaping.
4. Avoid stacked unrelated statements without whitespace just to reduce line count.
5. Multi-line object literals, arrays, JSX props, and parameter lists should be expanded when doing so improves scanability or reduces diff noise.
6. Prefer early returns over deep nesting when handling invalid state, authorization failure, or empty conditions.
7. Do not mix naming styles inside a module. Use one consistent pattern for the same kind of symbol.
8. Export names should match the file concern and should not expose vague generic names from domain modules.
9. Keep import groups stable and readable: external packages first, then internal aliases, then relative imports where still required.
10. Remove dead commented-out code instead of leaving it in place as an informal archive.

## 8. Comment Structure

1. Prefer no comment over a redundant comment.
2. Add comments only when the code alone does not make the intent, invariant, permission boundary, lifecycle rule, performance constraint, or workaround obvious.
3. Comments should be placed immediately above the block, branch, query, or export they explain, not far away from the relevant code.
4. Module-level comments should explain the file's responsibility, important boundaries, or unusual coupling only when that context is not already obvious from naming.
5. Inline end-of-line comments should be rare and used only for short clarifications that would be more distracting as a separate block comment.
6. Comments must be written from the perspective of the live system, for example why a rule exists now, what assumption is being enforced now, or what contract callers must respect now.
7. Do not write commit-oriented comments such as "fixed in phase 3", "temporary after last migration", "added in this commit", or "kept for now" without stating the real technical reason and removal condition.
8. Transitional comments are allowed only when they include both the current reason the code still exists and the explicit condition for removal.
9. Comments must not repeat file history, ticket history, or author intent when the code contract itself is what matters to a future maintainer.
10. Comments must stay ASCII, readable, and grammatically clear.
11. TODO comments are allowed only when they name the missing behavior or constraint precisely enough that another developer can act on them.
12. If a comment becomes false, vague, or stale, treat it as a defect and update or remove it in the same workstream.

## 9. Constants

1. Shared constants must use `UPPER_SNAKE_CASE`.
2. User-facing shared messages must live in a shared constant module when reused across surfaces.
3. Literal sets that define policy or behavior should move to named constants instead of being duplicated inline.
4. Temporary compatibility constants or flags should be marked clearly as transitional.
5. Policy literals that define security or permission boundaries should not be hidden inline inside unrelated rendering code.
6. Status and transition literals should be centralized when reused across more than one module.
7. Shared API messages, lifecycle labels, and transport constants should be centralized once reused across multiple endpoints or pages.
8. Retention, timeout, and retry policy values should be named constants once shared across a workflow or integration.

## 10. Error Codes

1. Shared application error codes must come from `src/lib/api/error-codes.ts`.
2. The baseline shared codes are:
   - `UNAUTHORIZED`
   - `FORBIDDEN`
   - `ACCESS_REVOKED`
   - `NO_ACCESS`
   - `NOT_FOUND`
   - `INVALID_REQUEST`
   - `INVALID_INPUT`
   - `RATE_LIMITED`
   - `INTERNAL_ERROR`
3. API and action helpers may include a code alongside the human-readable message where the caller benefits from stable programmatic handling.
4. Do not invent route-local error-code strings when a shared code already exists.

## 11. Responsiveness Verification

1. Every touched screen must be checked at least at one narrow mobile viewport and one standard desktop viewport before the work is considered complete.
2. Layouts must not require horizontal scrolling for primary workflows unless the UI is explicitly a data table with a deliberate overflow strategy.
3. Primary actions, filters, tabs, and navigation must remain visible or discoverable on smaller screens.
4. Empty, loading, success, and error states must remain readable and actionable on smaller screens.
5. Dialogs, drawers, tables, and dense cards must have an explicit small-screen behavior rather than relying on accidental shrinkage.

## 12. Immediate Adoption Rule

1. All new files and all touched files in the overhaul must follow this standard.
2. Existing legacy naming can remain temporarily where renaming would create broad churn, but any touched hotspot should be normalized when safe.
3. Mojibake or unreadable characters in comments, user-facing copy, or developer-facing docs should be treated as defects and removed when found.
4. Complexity thresholds are review triggers, not arbitrary style limits; splitting should improve clarity, not create fragmentation.
5. Major architectural decisions should be recorded in `docs/adr/` rather than left implicit in scattered commits.
6. Security, lifecycle, and idempotency assumptions should be documented near the workflow when they are not obvious from the code alone.
7. New UX states should reuse shared patterns for loading, empty, and error handling where practical.
