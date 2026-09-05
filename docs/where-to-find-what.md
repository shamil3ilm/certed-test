# Where to find what

A navigation guide for a developer joining Cert-Ed Academia. It answers "where does X happen?" without needing to ask the original author.

**The one rule that explains the layout:** responsibilities go downward and never back up.

```
src/app/**          pages, layouts, route handlers, server actions   — no SQL, no business rules
  └─ src/lib/services/**   domain rules + authorization decisions    — no SQL
       └─ src/lib/data/**  table access only                         — no domain rules
            └─ src/lib/supabase/**  client construction
```

If you find yourself writing a Supabase query in a page, or a permission check in `data/`, you are in the wrong layer.

---

## Quick index

| Question                                     | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where does authentication happen?            | [src/lib/session/actor-context.ts](../src/lib/session/actor-context.ts) — the single resolver. Session refresh in [src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts), invoked from [src/proxy.ts](../src/proxy.ts)                                                                                                                                                                                                                              |
| Where is authorization checked?              | Route gate: [src/lib/auth/require-role.ts](../src/lib/auth/require-role.ts). Per-resource: [src/lib/permission/](../src/lib/permission/). Database: RLS policies in `supabase/migrations/`                                                                                                                                                                                                                                                                       |
| Where are capabilities defined?              | [src/lib/capabilities/index.ts](../src/lib/capabilities/index.ts) — 18 capabilities and the persona → capability map                                                                                                                                                                                                                                                                                                                                             |
| Where are roles/personas defined?            | Fixed identity: `profiles.role`. Assignable: `persona_assignments`. Logic in [src/lib/services/users/personas.ts](../src/lib/services/users/personas.ts)                                                                                                                                                                                                                                                                                                         |
| Where are users created?                     | [src/lib/data/auth-accounts.ts](../src/lib/data/auth-accounts.ts) (`auth.admin.createUser`) + [src/lib/services/users/](../src/lib/services/users/)                                                                                                                                                                                                                                                                                                              |
| Where are resources created?                 | [src/app/(prt)/resources/UploadForm.tsx](<../src/app/(prt)/resources/UploadForm.tsx>) → [src/lib/services/resources.ts](../src/lib/services/resources.ts) → [src/lib/data/resources.ts](../src/lib/data/resources.ts)                                                                                                                                                                                                                                            |
| Where are resources fetched?                 | [src/lib/services/page-data/](../src/lib/services/page-data/) — one loader per page                                                                                                                                                                                                                                                                                                                                                                              |
| Where are attachments uploaded?              | Server-side to the academy's own Drive: [src/lib/services/attachments/](../src/lib/services/attachments/) + [src/lib/google/drive-storage-google.ts](../src/lib/google/drive-storage-google.ts), streamed back via [src/app/api/attachments/](../src/app/api/attachments/). See [ADR-0006](./adr/0006-custodial-attachment-storage.md).                                                                                                                          |
| Where are attachments downloaded?            | [src/app/api/resources/[id]/download/route.ts](../src/app/api/resources/[id]/download/route.ts)                                                                                                                                                                                                                                                                                                                                                                  |
| Where is Google Drive accessed?              | [src/lib/google/](../src/lib/google/) — server-side `drive-storage-google.ts` (real) and `drive-storage-mock.ts`, behind the `drive-storage.ts` interface. Link validation in [src/lib/drive-link.ts](../src/lib/drive-link.ts)                                                                                                                                                                                                                                  |
| Where are Supabase queries performed?        | **Only** in [src/lib/data/](../src/lib/data/) (50 modules, one per table group)                                                                                                                                                                                                                                                                                                                                                                                  |
| Where are API routes?                        | [src/app/api/](../src/app/api/) — 28 route handlers                                                                                                                                                                                                                                                                                                                                                                                                              |
| Where are errors handled?                    | [src/lib/errors.ts](../src/lib/errors.ts) (types), [src/lib/api/response.ts](../src/lib/api/response.ts) (HTTP shapes), [src/lib/observability/log.ts](../src/lib/observability/log.ts) (`logError`)                                                                                                                                                                                                                                                             |
| Where is validation performed?               | [src/lib/validation/](../src/lib/validation/) — Zod schemas, one per domain                                                                                                                                                                                                                                                                                                                                                                                      |
| Where are environment variables defined?     | Template: [.env.example](../.env.example). Accessors: [src/lib/env.ts](../src/lib/env.ts). Build guard: [next.config.js](../next.config.js) + [scripts/validate-build-env.mjs](../scripts/validate-build-env.mjs)                                                                                                                                                                                                                                                |
| Where are deployment settings?               | [vercel.json](../vercel.json) (region, crons), [next.config.js](../next.config.js) (headers, CSP, tracing), per-route `runtime`/`maxDuration` exports                                                                                                                                                                                                                                                                                                            |
| Where are business rules?                    | [src/lib/services/](../src/lib/services/) — and [docs/workflow-invariants.md](./workflow-invariants.md) states the ones that must hold                                                                                                                                                                                                                                                                                                                           |
| Where is rate limiting?                      | [src/lib/security/rate-limit.ts](../src/lib/security/rate-limit.ts) (in-process), [rate-limit-shared.ts](../src/lib/security/rate-limit-shared.ts) (Postgres-backed)                                                                                                                                                                                                                                                                                             |
| Where are class hours reported?              | [src/lib/services/teaching-hours.ts](../src/lib/services/teaching-hours.ts) — hours TAUGHT (per tutor/mentor) and RECEIVED (per student) from the same recorded sessions. Academy-wide report at [src/app/(prt)/admin/teaching-hours/](<../src/app/(prt)/admin/teaching-hours/>) (manageClasses); mentors get a scoped view on `/session-timings`. Student hours are NOT a partition of tutor hours — see [workflow-invariants.md](./workflow-invariants.md) §4a |
| Where do receipt/pay-slip amounts come from? | Hourly rates in `billing_rates`, maintained at [src/app/(prt)/admin/finance/billing-rates/](<../src/app/(prt)/admin/finance/billing-rates/>) (admin tier only). [src/lib/services/finance/hours-billing.ts](../src/lib/services/finance/hours-billing.ts) turns recorded hours × rate into a DRAFT; a person still presses Issue                                                                                                                                 |
| Where is the database schema?                | `supabase/migrations/` — the highest-numbered file is the head (currently `0091`). `supabase/rebuild/0000_full_rebuild.sql` is a generated snapshot for one-shot provisioning. Prose: [docs/schema-reference.md](./schema-reference.md)                                                                                                                                                                                                                          |

---

## Route groups

| Group            | Host                     | Purpose                                                                                                                  |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `src/app/(mkt)/` | `certedacademia.com`     | Public marketing site — about, classes, contact, blogs (content authoring: [content-pipeline.md](./content-pipeline.md)) |
| `src/app/(prt)/` | `app.certedacademia.com` | The academy portal — everything authenticated                                                                            |
| `src/app/api/`   | app host                 | Route handlers: finance PDFs, calendar, timetable, reports, cron, health                                                 |

The split is enforced in [src/proxy.ts](../src/proxy.ts) via `resolveHost()`. `PORTAL_ONLY=1` forces everything to the portal, for preview deploys on a bare `*.vercel.app` host.

---

## The request path

```
Browser
  → src/proxy.ts                     host split · session refresh · auth gate · 401 JSON for /api
    → src/app/(prt)/**/page.tsx      RSC page
      → requireCapability(cap)       coarse gate  [lib/auth/require-role.ts]
        → getActorContext()          user → profile → personas → capabilities (React.cache, once/request)
      → loadXPageData(me, params)    [lib/services/page-data/*]
        → permission checks          [lib/permission/*]
        → data reads                 [lib/data/*]
          → createClient()           RLS-scoped   (default)
          → createAdminClient()      service role (aggregation only — see ADR-0005)
            → Supabase Postgres      RLS policies are the real boundary
```

**Server Actions** follow the same path; they live beside the page that uses them (e.g. `manage-actions.ts`).

---

## Key functions

### `getActorContext()`

**[src/lib/session/actor-context.ts](../src/lib/session/actor-context.ts)**

Resolves the current actor once per request.

- **Inputs:** none (reads cookies via the Supabase server client)
- **Outputs:** `{ userId, profile, personas, capabilities, accessState }`
- **Depends on:** `createClient()`, `selectOwnProfileByAuthUserId`, `selectOwnActivePersonas`, `selectOwnActiveGlobalOverrides`
- **Called by:** every page guard, `requireCapability`, `requireCapabilityApi`, and pages needing capability detail directly
- **Failure:** **throws.** Deliberate — coercing a failed persona read to `[]` both blanks a healthy user's UI and silently drops admin DENY overrides. Surfaces via the page error boundary or `authFail`.
- **Assumption:** personas key off `profile.id`, _not_ `auth.uid()`. Auth identity and domain identity are different things here.

### `requireCapability(cap)` / `requireCapabilityApi(cap)`

**[src/lib/auth/require-role.ts](../src/lib/auth/require-role.ts)**

The coarse route gate. Pages redirect to `/dashboard?denied=1`; API handlers return 403.

```
requireCapability(cap)
├── Defined in: src/lib/auth/require-role.ts
├── Called by:  nearly every (prt) page and API route handler
└── Depends on: getActorContext() → resolveCapabilities()
```

Passing this does **not** mean access to a specific record — that is the service layer's per-resource check.

### `resolveCapabilities({ personas, overrides })`

**[src/lib/capabilities/index.ts](../src/lib/capabilities/index.ts)**

Pure function. Aggregates persona baselines, then applies admin overrides with precedence:

```
hard rule  >  explicit deny  >  explicit allow  >  persona default
```

An unrecognised persona contributes nothing (fail-closed). See [ADR-0002](./adr/0002-capability-first-route-guards.md).

### `requireClassAccess(classId)`

**[src/app/(prt)/classroom/access.ts](<../src/app/(prt)/classroom/access.ts>)**

Class-workspace guard: capability + class exists + caller is a member. `notFound()` on any failure, so a non-member cannot distinguish "no such class" from "not yours".

### `createClient()` vs `createAdminClient()`

**[src/lib/supabase/server.ts](../src/lib/supabase/server.ts) · [admin.ts](../src/lib/supabase/admin.ts)**

The most consequential choice in the data layer.

|         | `createClient()`                       | `createAdminClient()`                                            |
| ------- | -------------------------------------- | ---------------------------------------------------------------- |
| Scope   | RLS, as the signed-in user             | Service role — **bypasses RLS**                                  |
| Use for | anything a user reads about themselves | cross-user aggregation; writes already authorized by the service |
| Rule    | the default                            | must scope by the caller's own membership first                  |

Picking wrong either leaks data or returns empty results that read as "not found". Every service-role call site carries a comment justifying itself. See [ADR-0005](./adr/0005-rls-with-service-role-layering.md).

### `logError(tag, error, context?)`

**[src/lib/observability/log.ts](../src/lib/observability/log.ts)**

The only error sink. stderr + Sentry, severity-split. Never log secrets or full request bodies.

### `rateLimit()` vs `rateLimitShared()`

**[src/lib/security/](../src/lib/security/)**

`rateLimit` is in-process — use for authenticated, user-keyed throttles. `rateLimitShared` goes through the `rate_limit_hit` Postgres RPC and holds across serverless instances — use for **unauthenticated, IP-keyed** limits (registration, contact), where per-instance counters would multiply the real limit.

Both **degrade rather than disable**: if the shared store is unreachable, it falls back to the in-process limiter rather than allowing unconditionally.

---

## Data layer conventions

One module per table group in `src/lib/data/`. Every module:

- starts with `import 'server-only'`
- exports functions named `selectX` / `insertX` / `updateX` / `deleteX`
- **throws on error**, prefixed `module.function: message` — e.g. `exchange_rates.select: …`
- contains no domain rules and no authorization decisions

The throw convention is load-bearing: it is why a provisioning fault surfaces as an error boundary instead of a silently wrong number on a dashboard.

---

## Testing

| Suite                       | Location              | Run                                  |
| --------------------------- | --------------------- | ------------------------------------ |
| Unit / integration          | `tests/unit/`         | `npm test` · `npm run test:coverage` |
| E2E (Playwright, mock mode) | `tests/e2e/`          | `npx playwright test`                |
| RLS (real Postgres)         | `scripts/test-rls.sh` | `bash scripts/test-rls.sh`           |

**Mock mode** ([docs/mock-mode.md](./mock-mode.md)) runs the whole app against a JSON-file fake of Supabase — no cloud dependency. Seed fixtures: [src/lib/mock/seed.ts](../src/lib/mock/seed.ts). Fake client, including RPC mirrors: [src/lib/mock/client.ts](../src/lib/mock/client.ts).

⚠️ **Changing seed fixtures can break E2E specs that use `.first()` locators.** Run the E2E suite before committing a seed change — this has caused failures twice.

---

## Adding things

**A new table**

1. `supabase/migrations/00NN_name.sql` — table, indexes, **RLS policies**
2. `npm run db:rebuild-snapshot` (CI and a pre-push hook both block drift)
3. `src/lib/data/<table>.ts`
4. Add a mock fixture if any rendered page reads it — otherwise E2E silently stops covering that surface
5. Follow [docs/migration-checklist.md](./migration-checklist.md)

**A new page**

1. `src/app/(prt)/<route>/page.tsx`
2. `requireCapability('…')` first
3. `loadXPageData()` in `src/lib/services/page-data/`
4. Add the route to the E2E access matrix in `tests/e2e/negative-access.pw.ts`

**A new capability**

1. Add to `Capability` and the persona map in `src/lib/capabilities/index.ts`
2. Add a label in `capabilities/labels.ts`
3. Gate the routes, and add both positive and negative E2E controls

---

## Reference documents

| Document                                               | Covers                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [architecture-rules.md](./architecture-rules.md)       | Layering rules                                                                                   |
| [application-standards.md](./application-standards.md) | Conventions                                                                                      |
| [schema-reference.md](./schema-reference.md)           | Tables in prose                                                                                  |
| [rls-policy-inventory.md](./rls-policy-inventory.md)   | Every RLS policy                                                                                 |
| [persona-model.md](./persona-model.md)                 | Roles vs personas                                                                                |
| [workflow-invariants.md](./workflow-invariants.md)     | Rules that must hold                                                                             |
| [migration-checklist.md](./migration-checklist.md)     | Before shipping a migration                                                                      |
| [security-operations.md](./security-operations.md)     | Secrets, rotation, backup/recovery                                                               |
| [setup-guide.md](./setup-guide.md)                     | Provisioning a live environment                                                                  |
| [mock-mode.md](./mock-mode.md)                         | Local development                                                                                |
| [api-reference.md](./api-reference.md)                 | Route handlers                                                                                   |
| [adr/](./adr/)                                         | Decisions and their reasoning                                                                    |
| [qa/](./qa/)                                           | Dated point-in-time audits — the newest file is the authoritative status; older ones are history |
