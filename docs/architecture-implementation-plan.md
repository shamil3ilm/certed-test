# Architecture Implementation Plan

- Date: 2026-07-23
- Status: Working plan
- Purpose: Provide the step-by-step implementation plan for moving the application to a single, explicit, maintainable architecture.

---

## 1. Objective

Set the application on one clear architecture that is:

- easy to understand
- easy to extend
- easy to review
- hard to misuse
- aligned across code, database, tests, and documentation

This plan is intentionally implementation-oriented. It is not a design essay. Each phase should produce a visible structural improvement and reduce ambiguity for future work.

---

## 2. Target Architecture

The application should converge on the following structure:

### 2.1 Route Layer: `src/app`

Purpose:

- Next.js route entry points only
- pages, layouts, route handlers, loading/error files
- route-local transport files such as `actions.ts`

Rules:

- no direct Supabase queries
- no domain workflow logic
- no repeated permission logic
- no reusable design-system primitives

### 2.2 Feature Layer: `src/features`

Purpose:

- feature-owned UI composition
- feature-specific page helpers
- feature-local presentational pieces

Suggested domains:

- `auth`
- `dashboard`
- `classes`
- `assignments`
- `attendance`
- `messages`
- `users`
- `finance`
- `calendar`
- `students`
- `notifications`
- `settings`

### 2.3 Domain Layer

Current live home:

- `src/lib/services`

Target home after the dedicated rename phase:

- `src/lib/domain`

Purpose:

- business rules
- workflows
- authorization intent
- persona and capability logic
- side-effect orchestration

Examples:

- `auth`
- `permissions`
- `personas`
- `notifications`
- `dashboard`

### 2.4 Data Layer: `src/lib/data`

Purpose:

- all raw Supabase table and RPC access
- bounded query construction
- row selection and persistence helpers

Rules:

- no redirects
- no UI shaping
- no notification fan-out
- no audit decisions
- no domain branching beyond safe persistence concerns

### 2.5 Shared UI Layer: `src/lib/ui`

Purpose:

- reusable primitives
- reusable layout patterns
- shared display helpers

Rules:

- no business logic
- no Supabase access
- no domain imports

### 2.6 Shared Utility Layers

- `src/lib/api`: response envelopes, action helpers, error codes
- `src/lib/validation`: schemas and input parsing
- `src/lib/session`: request actor loading
- `src/lib/auth`: guard entry points and redirects

---

## 3. Dependency Direction

The dependency direction must become explicit:

1. `src/app` may import from `src/features` and `src/lib`
2. `src/features` may import from `src/lib`
3. `src/lib/services` in the current codebase, and `src/lib/domain` after the rename phase, may import from `src/lib/data`, `src/lib/validation`, `src/lib/api`, and focused shared utilities
4. `src/lib/data` may import only from low-level shared utilities and types
5. `src/lib/ui` must not import domain or data modules
6. `src/lib/data` must not import from `src/app` or `src/features`

Short form:

`app -> features -> domain -> data`

Shared support:

- `ui`
- `validation`
- `api`
- `auth/session`

---

## 4. Phase Plan

## Phase 1: Standards and Documentation Baseline

### Goal

Remove ambiguity before structural refactors begin.

### Work

1. Create and adopt `docs/architecture-rules.md`
2. Align `docs/application-standards.md` with the rule document
3. Clean mojibake and unreadable characters from:
   - docs
   - comments
   - user-facing copy
4. Update `README.md` so it reflects the current persona/auth/migration model
5. Add an architecture section to developer-facing docs

### Exit Criteria

- one canonical architecture rules document exists
- no major architecture docs contradict the codebase direction
- touched docs are plain ASCII and readable

---

## Phase 2: Shared UI Extraction

### Goal

Move portal-wide UI primitives out of route-group files and into a reusable shared UI layer.

### Current Hotspot

- `src/app/(prt)/ui.tsx`

### Target Split

- `src/lib/ui/core.tsx`
- `src/lib/ui/identity.tsx`
- `src/lib/ui/labels.tsx`
- `src/lib/ui/layout.tsx`
- `src/lib/ui/list.tsx`
- `src/lib/ui/forms.tsx`
- `src/lib/ui/charts.tsx`

### Work

1. Move shared primitives from `src/app/(prt)/ui.tsx` into `src/lib/ui/*`
2. Leave only route-local UI in route folders
3. Update imports incrementally by feature area
4. Add a barrel export only if it remains explicit and readable

### Exit Criteria

- no new imports from `src/app/(prt)/ui.tsx` in shared code
- portal-wide primitives live under `src/lib/ui`
- route folders contain only route-local UI

---

## Phase 3: Data Access Layer Establishment

### Goal

Eliminate ambiguity around where DB queries belong.

### Current Issue

Services directly call Supabase throughout the codebase, while docs still imply a repository pattern that is not actually present.

### Target

Introduce `src/lib/data/*` as the sole home for raw Supabase reads and writes.

### Suggested Modules

- `profiles.ts`
- `personas.ts`
- `capability-overrides.ts`
- `classes.ts`
- `enrollments.ts`
- `class-tutors.ts`
- `assignments.ts`
- `submissions.ts`
- `attendance.ts`
- `messages.ts`
- `notifications.ts`
- `calendar.ts`
- `finance.ts`
- `audit.ts`

### Work

1. Pilot the pattern with a small domain:
   - notifications
   - then messaging
2. Move raw queries into `src/lib/data/*`
3. Make domain services call data modules instead of `.from()` directly
4. Update docs to remove stale `src/lib/repos` claims

### Exit Criteria

- new DB work goes only into `src/lib/data/*`
- pilot domains no longer call Supabase directly from service modules
- data-access pattern is clear to new contributors

---

## Phase 4: Domain Module Split

### Goal

Reduce oversized service files that currently mix multiple concerns, while keeping `src/lib/services` as the active home until the rename phase is explicitly started.

### Current Hotspots

- messaging
- submissions
- admin users
- dashboard

### Target Shape

Near-term split shape inside the current tree:

- `src/lib/services/messaging/queries.ts`
- `src/lib/services/messaging/commands.ts`
- `src/lib/services/messaging/policies.ts`
- `src/lib/services/messaging/view-models.ts`

Near-term split shape inside the current tree:

- `src/lib/services/submissions/queries.ts`
- `src/lib/services/submissions/commands.ts`
- `src/lib/services/submissions/grading.ts`
- `src/lib/services/submissions/student-actions.ts`

### Work

1. Split read models from commands
2. Split policy helpers from workflow handlers
3. Split notification and audit side effects away from core mutation logic where sensible
4. Keep domain APIs stable while internal structure changes

### Exit Criteria

- no high-churn feature depends on one oversized service file
- file responsibilities are discoverable from names alone

---

## Phase 5: Feature-Folder Normalization

### Goal

Make each user-facing area understandable from one feature folder.

### Work

Create or normalize feature homes:

- `src/features/dashboard`
- `src/features/messages`
- `src/features/classes`
- `src/features/assignments`
- `src/features/users`
- `src/features/students`
- `src/features/notifications`

Move into those folders:

- feature view components
- feature page helpers
- feature-local presentational modules

Keep in route folders only:

- `page.tsx`
- `layout.tsx`
- `loading.tsx`
- `error.tsx`
- `route.ts`
- route transport files that are still route-owned

### Exit Criteria

- main route files are thin wrappers
- each major feature is understandable from one folder

---

## Phase 6: Auth, Persona, and Capability Consolidation

### Goal

Keep one clear source of truth for actor identity and authorization.

### Work

1. Retain `getActorContext()` as the request actor entry point
2. Consolidate persona and capability rules into clearly named domain modules
3. Keep database authority aligned with helper functions and RLS helpers
4. Document how to add a new persona end-to-end:
   - DB enum or table support
   - capability mapping
   - nav impact
   - guard impact
   - tests
   - docs

### Exit Criteria

- no duplicate admin authority models
- no duplicate persona resolution logic
- future persona addition is a documented procedure

---

## Phase 7: API and Action Transport Standardization

### Goal

Make every mutation path look and behave the same.

### Work

1. Use shared API response helpers everywhere
2. Use shared action result helpers everywhere
3. Use shared error codes everywhere
4. Remove route-local result dialects
5. Standardize validation flow:
   - parse input
   - authorize
   - execute domain command
   - revalidate or return transport result

### Exit Criteria

- action and API error shapes are predictable
- no transport-level surprises across features

---

## Phase 8: Database and RLS Alignment

### Goal

Make DB architecture match the application architecture.

### Work

1. Keep migrations as the only schema source of truth
2. Remove duplicate authority logic where possible
3. Harden self-update tables so users can change only intended fields
4. Validate indexes for hot paths:
   - notifications unread count
   - inbox loading
   - attendance per class/date
   - active submissions
   - mentorship lookups
   - persona lookup
5. Keep all policy helpers recursion-safe and documented

### Exit Criteria

- RLS and application auth model agree
- hot queries are bounded and indexed
- migrations are understandable as a linear story

---

## Phase 9: Test Architecture Alignment

### Goal

Make tests mirror the architectural boundaries.

### Work

1. Keep unit tests grouped by concern:
   - domain
   - data
   - validation
   - permissions
2. Keep E2E grouped by persona journey and workflow
3. Remove stale tests that encode obsolete structure
4. Add focused coverage whenever architecture refactors move authorization or workflow behavior

### Exit Criteria

- failing tests point to a clear layer
- tests reinforce the target architecture instead of older mixed-layer patterns

---

## Phase 10: Final Documentation Realignment

### Goal

Make docs trustworthy for future maintenance.

### Work

1. Update `README.md`
2. Update `docs/persona-model.md`
3. Update `docs/schema-reference.md`
4. Add or update architecture overview docs
5. Keep this plan and the rules document as living references

### Exit Criteria

- a new developer can understand the project layout without reverse-engineering the code

## Phase 11: Domain-Layer Rename Decision

### Goal

Resolve the `services` versus `domain` naming question explicitly instead of letting both names coexist informally.

### Decision options

1. Keep `src/lib/services` as the long-term orchestration layer name
2. Rename `src/lib/services` to `src/lib/domain` in one coordinated phase

### Rule

Until this phase is intentionally executed, the repo should treat `src/lib/services` as the active domain-orchestration home.

### Exit Criteria

- one name is chosen as long-term truth
- architecture docs all use the same name
- no new code is written against the losing name

---

## 5. Priority Order

Recommended execution order:

1. standards/doc baseline
2. shared UI extraction
3. data-layer pilot
4. split oversized domain services
5. feature-folder normalization
6. auth/persona consolidation
7. transport standardization
8. DB/RLS alignment
9. test alignment
10. final docs pass
11. explicit `services` versus `domain` naming resolution if a rename is still desired

---

## 6. Immediate First Batch

The lowest-risk starting batch is:

1. clean docs and rules
2. extract `src/app/(prt)/ui.tsx` into `src/lib/ui/*`
3. create `src/lib/data/notifications.ts`
4. create `src/lib/data/messages.ts`
5. split `src/lib/services/messaging.ts`

This gives the codebase an explicit structural backbone without changing core user behavior first.

---

## 7. Definition of Done

The architecture pass is complete only when all of the following are true:

1. pages and route handlers are thin
2. shared UI is not route-scoped
3. DB access has one obvious home
4. domain workflows have one obvious home
5. persona and capability logic is centralized
6. docs match the codebase
7. tests match the architecture
8. naming and standards are consistent
9. unreadable characters are removed from code, docs, and user-facing copy

---

## 8. Change-Control Rule

This plan must be updated whenever:

1. a new architectural layer is introduced
2. a major folder convention changes
3. a new persona changes auth or workflow structure
4. the chosen data-access pattern changes

If the code changes but this plan is not updated, the codebase is drifting again.
