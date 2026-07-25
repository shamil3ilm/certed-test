# Cert-Ed Academia

Two applications share this repository and are split by host:

1. `certedacademia.com`: the public marketing site
2. `app.certedacademia.com`: the private academy portal

The portal is a class-centric learning and operations app for:

- super admins
- sub-admins
- tutors
- mentors
- students

## Current product model

- Access is allowlist-first. Accounts are created in `profiles` before a user signs in.
- Authentication is handled by Supabase Auth.
- Authorization is persona-driven through `persona_assignments` and capability resolution.
- `profiles.role` is still the fixed identity field used for account type and some UX decisions.
- The core academic model is class-based:
  - stream
  - classwork
  - people
  - attendance
  - grading
- The app also includes:
  - in-app messaging
  - in-app notifications
  - reminders
  - receipts and payslips
  - calendar and timetable
  - mentor-to-student oversight

## Tech stack

- Next.js 14 App Router
- TypeScript
- Supabase Auth and Postgres
- Tailwind CSS
- Vercel hosting

## Local development

The fastest local path is mock mode.

```bash
npm install
npm run dev
```

Mock mode is already wired through `.env.local` in local setups. It runs the portal against the JSON-backed fake data layer in `src/lib/mock`.

Demo accounts in mock mode include:

- `admin@mock.test`
- `subadmin@mock.test`
- `tutor@mock.test`
- `mentor@mock.test`
- `student@mock.test`
- `student2@mock.test`

Default mock password:

- `cert-ed`

See [docs/mock-mode.md](docs/mock-mode.md) for details.

## Going live

Use the setup guide:

- [docs/setup-guide.md](docs/setup-guide.md)

Important:

- The authoritative database source is `supabase/migrations`
- The migration chain currently runs from `0001` through `0029`
- Do not use only the early migrations listed in older notes or screenshots

## Testing

```bash
npm test
npx tsc --noEmit
npx playwright test
```

## Project structure

Current key areas:

- `src/app/(mkt)`: marketing site routes
- `src/app/(prt)`: portal routes (route entry and route-local components only)
- `src/lib/ui`: the shared design system - primitives, layout, list, forms, charts
- `src/lib/services`: domain orchestration (workflows, rules, side effects, audit)
- `src/lib/data`: raw Supabase table access, one module per table group
- `src/lib/auth`: auth guards and access helpers
- `src/lib/capabilities`: persona baseline and capability resolution
- `src/lib/session`: actor context loading
- `src/lib/mock`: mock mode harness
- `src/lib/api`: shared API and action response helpers
- `src/lib/validation`: schemas and input validation
- `supabase/migrations`: authoritative schema and RLS chain
- `supabase/rebuild`: fresh-build snapshot that should match the migration end state
- `docs`: project documentation

Dependency direction is `app -> services -> data`, with `ui`, `validation`, `api` and
`auth/session` as shared leaves. See [docs/architecture-rules.md](docs/architecture-rules.md)
for the binding rules.

## Architecture references

These documents are the current architecture references:

- [docs/application-standards.md](docs/application-standards.md)
- [docs/architecture-rules.md](docs/architecture-rules.md)
- [docs/architecture-implementation-plan.md](docs/architecture-implementation-plan.md)

Status of the architecture pass:

- Done: the shared design system moved out of the route group into `src/lib/ui`; a real
  data-access layer exists at `src/lib/data` (notifications, messaging); the messaging
  domain is split into policies/commands/queries behind a barrel.
- In progress: moving the remaining domains' table access into `src/lib/data`, and
  splitting the other oversized service modules (submissions, users).
- Not started: the `src/features` layer, and renaming `src/lib/services` to
  `src/lib/domain`.

## Database references

- [supabase/README.md](supabase/README.md)
- [docs/schema-reference.md](docs/schema-reference.md)
- [docs/rls-policy-inventory.md](docs/rls-policy-inventory.md)
- [docs/persona-model.md](docs/persona-model.md)
- [docs/workflow-invariants.md](docs/workflow-invariants.md)
