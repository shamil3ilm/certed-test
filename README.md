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
- `profiles.role` remains the fixed identity field used for account type and some UX decisions.
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

- Next.js 16 App Router
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

When Supabase env vars are absent locally, the app runs against the JSON-backed mock harness in `src/lib/mock`.

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
- The migration chain starts at `0001`; the current end is the highest-numbered file in `supabase/migrations/`
- Do not use only the early migrations listed in older notes or screenshots

## Testing

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Optional:

```bash
npx playwright test
```

## Project structure

Current key areas:

- `src/app/(mkt)`: marketing site routes
- `src/app/(prt)`: portal routes and route-local components only
- `src/lib/ui`: shared design system
- `src/lib/services`: domain orchestration
- `src/lib/data`: raw Supabase table access
- `src/lib/auth`: auth guards and access helpers
- `src/lib/capabilities`: persona baseline and capability resolution
- `src/lib/session`: actor context loading
- `src/lib/mock`: mock mode harness
- `src/lib/api`: shared API and action response helpers
- `src/lib/validation`: schemas and input validation
- `supabase/migrations`: authoritative schema and RLS chain
- `supabase/rebuild`: rebuild snapshot derived from the migration end state
- `docs`: project documentation

Dependency direction is `app -> services -> data`, with `ui`, `validation`, `api`, and `auth/session` as shared leaves. See [docs/architecture-rules.md](docs/architecture-rules.md) for the binding rules.

## Architecture references

These documents are the current architecture references:

- [docs/application-standards.md](docs/application-standards.md)
- [docs/architecture-rules.md](docs/architecture-rules.md)
- [docs/architecture-implementation-plan.md](docs/architecture-implementation-plan.md)

Current architecture status:

- The live layering is `src/app -> src/lib/services -> src/lib/data`
- `src/lib/ui` is the shared design-system home
- `src/lib/data` is the canonical home for raw Supabase access
- `src/features` does not exist in the live codebase yet
- `src/lib/services` remains the active domain-orchestration layer name

## Database references

- [supabase/README.md](supabase/README.md)
- [docs/schema-reference.md](docs/schema-reference.md)
- [docs/rls-policy-inventory.md](docs/rls-policy-inventory.md)
- [docs/persona-model.md](docs/persona-model.md)
- [docs/workflow-invariants.md](docs/workflow-invariants.md)
