# repos/ → services/ migration — 2026-07-15

Full migration from `src/lib/repos/*` (thin CRUD) to `src/lib/services/*`, where
every mutation embeds its own permission check, DB write, and audit entry —
structurally closing the class of bug the security audit found earlier today
(`createLinkResourceAction` forgetting its `canManageClass` check). Executed
per the plan produced by the `planner` agent, in 8 phases, each independently
verified (typecheck + lint + full `vitest` suite green) before moving on.

## What changed

- **`src/lib/permission/`** (new) — single import surface for every
  authorization decision: `canManageClass`/`canManageScope`/`canAccessClass`
  (admin-client membership), `canMentor`, `canWriteClass` (the RLS-RPC
  mechanism calendar/timetable use — kept deliberately separate from
  `canManageClass`, not merged).
- **`src/lib/errors.ts`** (new) — `ServiceError` base + `PermissionError`
  (403) / `NotFoundError` (404) / `ValidationError` (422). Coexists with the
  pre-existing `'no-access'|'revoked'|'forbidden'` string-coded errors from
  `requireRole`/`requireRoleApi`.
- **`src/lib/api/response.ts`** — added `apiError(e)`: maps a thrown error to
  a Route Handler response (typed → its status; coded auth string → the
  existing `authFail`; anything else → a generic 500, never forwarding an
  unknown error's message to the client).
- **`src/lib/api/actionError.ts`** (new) — `toActionError(e)` for Server
  Actions with a structured `{ok,error}` return contract.
- **`src/lib/services/`** (new) — one module per domain: `resources`,
  `announcements`, `meetLinks`, `attendance`, `assignments`, `submissions`,
  `calendarEvents`, `timetableSlots`, `classes`, `enrollments`,
  `classTeachers`, `users`, `mentorships`, `mentees`, `comments`,
  `reminders`, `finance/{orgSettings,documentCounters,financeDocs}`. Every
  mutation function takes `(actor, input)`; reads stay plain exports.
- **`src/lib/repos/`** — now contains only `audit.ts` (the write sink,
  deliberately left in place). Every other file deleted; `git grep
  "@/lib/repos/"` returns only `audit.ts` imports.
- **Server Actions / Route Handlers** — now thin: coarse `requireRole` gate,
  Zod-parse input, one service call, map/propagate the error. No inline
  `canManage*`/`writeAudit` calls remain outside `services/`.

## Behavior changes made along the way

- **New audit log actions** (previously unaudited, per the plan's Phase 2/4
  notes): `meet.create`, `meet.delete`, `event.update`, `event.move`,
  `event.delete`, `timetable.update`, `timetable.reassign`,
  `timetable.deactivate` — carried over from this morning's security audit,
  now living inside the services instead of hand-added per route.
- **"Surface real errors" policy** (per your direction mid-session): actions
  that used to silently `return` on a not-found/not-authorized condition
  (`deleteResourceAction`, `deleteMeetLinkAction`, `revokeUserAction`,
  `editUserAction`, etc.) now let the typed error propagate — either to the
  portal error boundary (`error.tsx`) or, for actions with a structured
  `{ok,error}` return, as a real inline message. Nothing was left silently
  swallowing errors.
- **`api/assignments` POST** now has an explicit `canManageClass` gate
  (previously relied on RLS alone) — a hardening change flagged in the plan,
  not a mechanical no-op.

## What did NOT change (explicitly preserved)

- Each operation's DB client (service-role vs RLS-scoped) — never flipped.
- The two permission mechanisms (admin-client `canManageClass` vs RLS-RPC
  `canWriteClass`) — kept separate; merging them is a future decision, not
  bundled into this move.
- Registration bootstrap (`getRegistrationTarget`/`bindPasswordAccount`) and
  self-service profile/password updates — kept their original
  non-actor-gated shape; they're unauthenticated/self-scoped by design.

## Verification

- `npx tsc --noEmit` — clean at every phase and at the end.
- `npx eslint .` — zero new errors; the ~200 `no-explicit-any` hits reported
  are 100% pre-existing test-file debt (confirmed against the pre-migration
  baseline), none in `src/lib/services/` or `src/lib/permission/`.
- `npx vitest run` — 139 → **238 tests**, all passing. ~100 new tests added,
  one per service's mutation functions (permission-denied / not-found /
  happy-path / audit-called-with cases), plus `permission.test.ts` and
  `errors.test.ts` for the Phase 0 foundations.
- Fixed two latent test-infra issues discovered along the way, now fixed
  globally so they don't recur: `react`'s missing `cache()` export under
  plain Vitest (stubbed in `vitest.setup.ts`), and `vi.clearAllMocks()` not
  clearing queued `mockResolvedValueOnce` values across tests (switched to
  `vi.resetAllMocks()` in all new service test files).
- Playwright e2e was **not** run this session (would need a built app +
  mock-mode server) — recommend running the full suite
  (`scoping`/`journeys`/`personas`/`phase1`) before this branch ships.

## Deferred (not part of this migration)

- Full `repos/` → `services/` rename is now done; the earlier-flagged
  `next/cache`/`next/navigation`/`next/server` import ban inside
  `services/**` (an ESLint `no-restricted-imports` rule) was not added —
  worth a follow-up if you want it structurally enforced rather than just
  convention.
- Everything already deferred from the security audit doc still stands:
  Next.js 14→15/16 CVE upgrade, finance tables' unrestricted admin RLS,
  real (non-dev) login audit trail, Drive "anyone with link" sharing.

## Next up

Per the agreed priority order, the dashboard data-loading fix
(`listProfiles`/`listClasses`/`listEnrollments` pulled in full and
aggregated in JS instead of SQL, in `dashboard/page.tsx`) is next.
