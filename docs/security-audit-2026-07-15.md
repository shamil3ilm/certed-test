# Security audit — 2026-07-15

Follow-up audit on top of the 2026-07-14 RLS hardening pass (migration 0009), run as
part of the "production sooner" priority ordering: security/RLS first, then dashboard
performance, then service-layer formalization, then everything else in the original
architecture proposal.

Four parallel review passes covered: RLS/DB policies, storage & signed-URL access,
API input validation & rate limiting, and audit-log completeness. **No CRITICAL
findings.** 5 HIGH, 11 MEDIUM, 7 LOW/informational.

## Fixed this session

### HIGH
- **Disabled users kept RLS access to their own data.** A revoked user's Supabase
  session isn't invalidated on revoke, so ~13 "own row" RLS self-branches (enrollments,
  class_teachers, mentorships, submissions, comments, receipts/receipt_lines,
  payslips/payslip_lines, reminders, attendance) that checked only
  `auth_user_id = auth.uid()` let a disabled student/teacher keep reading their own
  data indefinitely via a direct PostgREST call. **Fix delivered as SQL, not yet
  applied** — see [`certed-db-2026-07-15-rls-self-active-hardening.sql`](../../Documents/certed-db-2026-07-15-rls-self-active-hardening.sql)
  in `C:\Users\Shamil\Documents` (mirrored in `supabase/migrations/0011_rls_self_active_hardening.sql`).
  Deliberately does **not** touch `profiles_self_read`/`profiles_self_update` — a
  pending/disabled user must still read their own profile row for `/access-pending`
  and `/access-revoked` to render correctly.
- **`addTutorAction` didn't verify the target profile is actually a teacher**
  (`class-actions.ts`) — a crafted POST could pair a student/sub_admin id into
  `class_teachers`, granting full teacher-level RLS access without changing their
  `role`. Fixed by mirroring the existing `assignMentorAction` role-check pattern.
- **Calendar event update/move/delete were never audit-logged**
  (`api/events/[id]/route.ts`) — exactly the "move" path hardened for authz in
  commit `2043c51`, with zero forensic trail. Added `event.update`/`event.move`/`event.delete`.
- **Timetable slot update/reassign/deactivate were never audit-logged**
  (`api/timetable/[id]/route.ts`) — same gap, same recently-hardened path. Added
  `timetable.update`/`timetable.reassign`/`timetable.deactivate`.
- **Next.js 14.2.35 has several current high-severity CVEs** (HTTP smuggling,
  middleware/proxy cache poisoning, RSC cache poisoning, DoS). **Not fixed** — 14.2.35
  is already the latest 14.2.x patch; the real fix requires a major-version jump to
  15.5.10+ or 16.x, which is a breaking migration, not a safe patch bump. Flagged as
  its own follow-up (see below), not force-pushed through this pass.

### MEDIUM
- `enrolStudentAction` didn't verify the target is actually a student — same fix pattern as `addTutorAction`.
- Finance CSV export (`/api/{receipts,payslips}/export`) had no `Cache-Control` header — added `private, no-store`, matching the PDF handler.
- Finance export wasn't audit-logged despite dumping the entire ledger — added `{kind}.export`.
- `issueDoc` didn't verify the party's role matches the document kind (student for receipt, teacher for payslip) — added an explicit check.
- `createLinkResourceAction` relied on RLS alone instead of the explicit `canManageClass` gate every sibling write action uses (and RLS isn't enforced in mock mode) — added the gate + a missing `resource.create` audit entry.
- POST `/api/timetable` validated `teacher_id` was a UUID but not that it's an active teacher, while PATCH already did — added the same check (only when `teacher_id` is present; it's optional on create).
- `sub_admin` couldn't read the `mentorships` table via RLS, silently breaking the Mentors tab on the Users hub for that role — added a service-role `listMentorshipsForUsersHub()` (same pattern as `listProfiles()`) instead of relying on RLS there.
- No server-side length/format bounds on reminders (`title`/`description`/`remind_at`), comments (`content`/`entity_id`), or settings (`full_name`/password max length) — added Zod schemas (`lib/validation/{reminder,comment}.ts`, extended `lib/validation/user.ts`) mirroring existing bounds elsewhere in the codebase.
- Dev-only login (mock mode) had no audit trail for success/failure — added `auth.login_success`/`auth.login_failure`.

### LOW
- Resource download route had no rate limiting (every other file-serving route did) — added, matching the finance PDF handler's pattern.
- Finance issue/void/export handlers had no rate limiting — added.

## Deferred — needs a decision, not a quick fix

- **Next.js major-version upgrade (14→15/16)** to actually close the CVEs above. Real
  breaking-change migration (App Router/RSC changes), needs its own scoped pass with
  a build/test cycle, not something to force through inside a review-and-fix pass.
- **Finance tables' admin RLS grants unrestricted UPDATE/DELETE**, not just void —
  the app enforces "immutable, void+reissue only" purely in application code
  (`voidDoc`), so a direct PostgREST call from an admin session could bypass that
  invariant. This is consistent with every other `*_admin_write` policy in the schema
  (`FOR ALL USING(is_active_admin())`), so it reads as a deliberate "admin = DB
  superuser" design choice rather than an oversight — flagging for an explicit
  decision rather than unilaterally narrowing admin capabilities.
- **Real (non-dev) login has no server-side audit hook.** Password sign-in runs
  client-side via `supabase.auth.signInWithPassword`, so there's no server code path
  to log from today. Closing this needs either moving sign-in through a server
  action or wiring a Supabase Auth webhook/Edge Function — an architecture decision,
  not a one-line fix.
- **Google Drive resource/submission links use "anyone with the link" sharing.**
  Already a known, explicitly reviewed trade-off (see
  `docs/superpowers/specs/2026-07-10-drive-picker-submissions-design.md` §7), with
  per-grader `{type:'user', role:'reader'}` sharing listed as a planned enhancement.
  Worth re-prioritizing now given submission files can contain student PII, but it's
  a real feature, not a quick fix.
- **Audit log entries have no before/after values** — every entry is
  `actor/action/entity_type/entity_id` with no diff, limiting forensic value for
  role-change/grade-tampering investigations. A schema change (new columns), not a
  quick fix.
- Dev-toolchain-only `npm audit` findings (eslint/vitest transitive deps) — not a
  runtime/production risk; routine `npm audit fix` in a maintenance pass covers it.
- `MOCK_MODE` gating relies on a `VERCEL` env check beyond the mode flag itself — a
  real, working gate today; only relevant if this app is ever deployed off Vercel.

## Action needed from you

1. **Run `certed-db-2026-07-15-rls-self-active-hardening.sql`** in the Supabase SQL
   editor for `certed-test` — this is the one HIGH-severity fix that isn't live yet
   (everything else was a code change, already applied in this branch).
2. Decide on the Next.js upgrade timeline (separate scoped effort).
3. Decide whether to narrow finance tables' admin RLS to void-only, or accept the current "admin = DB superuser" model.

## Next up

Per the agreed priority order: dashboard data-loading (unpaginated `listProfiles`/
`listClasses`/`listEnrollments` + JS-side aggregation in `dashboard/page.tsx`), then
service-layer formalization.
