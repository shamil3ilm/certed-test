# Cert-Ed Academia App — Implementation Plan Index (ordered)

> **How to build this (no special model, plugin, or skill required).** Each phase has a self-contained plan file. Build the phases **in order (0→5)**; within a phase, do the tasks top to bottom, following each step verbatim (write the shown test → run the command → confirm FAIL → paste the shown code → confirm PASS → commit). No plugin, skill, or advanced reasoning is needed — everything is provided literally. Check off each `- [ ]` as you go.

**Goal:** Ship the role-based learning app at `app.certedacademia.com` (Supabase Auth + Postgres, Google Drive files, Next.js on Vercel) per the spec at `docs/superpowers/specs/2026-06-25-cert-ed-academia-app-design.md`.

**Architecture:** One Next.js 14 app, two domains by hostname middleware; Supabase (Auth + Postgres + RLS) as backend-as-a-service; Next.js server code (Route Handlers + Server Actions on Vercel) as the backend-for-frontend; files uploaded browser→Google Drive via server-initiated resumable sessions.

**Tech Stack:** Next.js 14, TypeScript, Tailwind 4, `@supabase/supabase-js` + `@supabase/ssr`, `googleapis`, Zod, FullCalendar, `@react-pdf/renderer` (or HTML→PDF — decided in Phase 4), Playwright.

---

## How to use this index

**Designed to be built by any developer or coding agent — including smaller/cheaper models — with no plugins, skills, or advanced reasoning.** Every task lists exact files, full test + implementation code, exact commands with expected output, and a commit; follow them literally.

Build phases **in order (0→5)**. All six phase plans are fully written (table below). Within a phase, do the tasks top to bottom. A phase is "done" when its acceptance criteria pass and it is committed. Do not start a phase before its dependencies (the *Depends on* column) are green.

| Phase | Plan file | Depends on | Delivers (acceptance) |
|---|---|---|---|
| 0 — Foundation | [2026-06-25-phase-0-foundation.md](2026-06-25-phase-0-foundation.md) | — | Login works; allowlisted user reaches a role-aware empty dashboard; non-allowlisted user is blocked; Drive token + folder bootstrap proven; resumable-CORS spike resolved |
| 1 — Announcements + Admin | [2026-06-25-phase-1-announcements-admin.md](2026-06-25-phase-1-announcements-admin.md) | 0 | Admin adds users/courses/enrollments/teacher-assignments + revoke/restore; teacher/admin post announcements; students see scoped feed |
| 2 — Resources | [2026-06-25-phase-2-resources.md](2026-06-25-phase-2-resources.md) | 1 | Teacher uploads a file (resumable→Drive); student in that course downloads it via access-checked endpoint |
| 3 — Assignments + submissions | [2026-06-25-phase-3-assignments.md](2026-06-25-phase-3-assignments.md) | 2 | Teacher posts assignment; student submits a file; status submitted/late; teacher views submissions |
| 4 — Finance | [2026-06-25-phase-4-finance.md](2026-06-25-phase-4-finance.md) | 1 | Admin issues a numbered receipt/pay-slip PDF into Drive; student/teacher downloads own; void+reissue; CSV export |
| 5 — Calendar & timetable | [2026-06-25-phase-5-calendar.md](2026-06-25-phase-5-calendar.md) | 1 (+3 for deadlines) | Month⇄week calendar shows timetable slots + events + assignment due dates, in the viewer's device timezone |

**Cross-cutting (built into the phases, not separate):** RLS on every table; Zod validation at every boundary; device-timezone display; audit log on sensitive actions; rate limiting on write/upload endpoints; pagination + title search on list pages.

---

## Phase task outlines (ordered)

> All six phases are now fully expanded into bite-sized TDD detail in their own files (linked in the table above). The lists below are a quick map; the linked phase files are the source of truth for execution.

### Phase 0 — Foundation  → see [2026-06-25-phase-0-foundation.md](2026-06-25-phase-0-foundation.md)
1. Install deps + `.env.example`
2. Create Supabase project + enable Google provider (config + verify)
3. Migration: `profiles`, `org_settings`, `current_role()` helper, RLS, seed admin
4. Supabase server/browser client helpers (`lib/supabase`)
5. Login page + auth callback route
6. `requireRole` guard + profile loader (TDD)
7. Hostname middleware (TDD on host logic) + `app/(app)/` shell
8. Role-aware dashboard shell
9. Drive one-time consent script (local) → refresh token
10. Drive token client + folder bootstrap/resolver (TDD with mock)
11. `org_settings` seed + read
12. Drive resumable-upload CORS spike (risk gate)
13. Vercel Cron keep-alive

### Phase 1 — Announcements + Admin  → see [2026-06-25-phase-1-announcements-admin.md](2026-06-25-phase-1-announcements-admin.md)
1. Migration: `courses`, `enrollments`, `course_teachers`, `announcements`, `audit_log` + RLS (scoped read/write)
2. Repos: `lib/repos/{courses,enrollments,courseTeachers,announcements}.ts`
3. Zod schemas for each
4. Admin Users screen: list + Add user (email/role/class) + revoke/restore (service-role + admin sign-out + audit) — TDD on the revoke action
5. Admin Courses screen: courses + enrollments + teacher assignments
6. Announcements API (GET scoped / POST / PATCH / archive) — TDD on scope guard
7. Announcements UI: feed (student scoped) + composer (teacher/admin)
8. E2E: admin adds a student → teacher posts announcement → student sees it; revoked student is blocked

### Phase 2 — Resources  → see [2026-06-25-phase-2-resources.md](2026-06-25-phase-2-resources.md)
1. Migration: `resources`, `drive_folders` + RLS (read=enrolled, write=teacher-of-course/admin)
2. `lib/drive/resumable.ts`: `initSession()` + `finalize()` (TDD with mocked Drive)
3. `uploads/init` + `uploads/finalize` API (validates type/size from Drive metadata at finalize) — TDD
4. Reusable client uploader hook `useResumableUpload` (init→PUT→finalize)
5. `cron/reconcile-uploads` job (trash orphaned pending) — TDD on the selection query
6. Access-checked download endpoint `resources/[id]/download` — TDD on the access check
7. Resources UI: teacher upload, student browse/download by course
8. E2E: teacher uploads → enrolled student downloads → non-enrolled student is 403

### Phase 3 — Assignments + submissions  → see [2026-06-25-phase-3-assignments.md](2026-06-25-phase-3-assignments.md)
1. Migration: `assignments`, `submissions` + RLS
2. Repos + Zod
3. Assignments API (GET/POST/PATCH/archive) reusing the resumable uploader for attachments
4. Submissions API (POST record after resumable upload); status submitted/late vs absolute `due_date` — TDD on the late calc
5. Resubmission (latest wins, prior kept) — TDD
6. UI: teacher create + view submissions; student submit + status
7. E2E: teacher posts → student submits → teacher sees it → status flips late after due

### Phase 4 — Finance  → see [2026-06-25-phase-4-finance.md](2026-06-25-phase-4-finance.md)
1. Migration: `receipts`, `receipt_lines`, `payslips`, `payslip_lines`, `document_counters` + RLS (own-only reads; admin writes)
2. `lib/money.ts` currency formatting (TDD) + total computation (TDD)
3. Number allocator (transactional, per type/year) — TDD on concurrency/uniqueness
4. PDF via HTML→Chromium (`@sparticuz/chromium` + `puppeteer-core`); port **Option B · Modern Minimal** (`receipt/Receipt Templates.dc.html`) with brand fonts (Louis George Cafe + Dagger Square), **omitting paid/due + due-date for now** → `lib/pdf/{receiptTemplate,payslipTemplate,renderPdf}`
5. Issue API: validate → allocate number → render PDF → upload server→Drive → insert + audit — TDD on the orchestration (mocks)
6. Void API (mark voided, keep number) + reissue — TDD
7. Last-used-rate prefill query — TDD
8. Admin finance UI (issue receipt/pay-slip, itemized lines, live total) + org_settings editor
9. Student `/receipts` + teacher `/payslips` (download own) + CSV export
10. E2E: admin issues receipt → student downloads → void → reissue

### Phase 5 — Calendar & timetable  → see [2026-06-25-phase-5-calendar.md](2026-06-25-phase-5-calendar.md)
1. Migration: `timetable_slots`, `calendar_events` + RLS
2. `lib/time.ts`: anchor-TZ slot expansion → absolute instants; device-TZ formatting (TDD)
3. Calendar API: merge expanded slots + events + assignment due dates for a date range (TDD on the merge)
4. `/calendar` UI with FullCalendar month⇄week toggle (device TZ + label)
5. Teacher/admin timetable + event management (scoped)
6. E2E: admin creates slot → enrolled student sees it in week & month, in their device TZ

---

## Global Definition of Done (every phase)
- [ ] New tables have RLS enabled + policy tests (per-role, incl. teacher course-scope + admin override)
- [ ] All API inputs validated with Zod; errors returned in the `{ success, data?, error? }` envelope
- [ ] Unit + integration tests green; phase E2E green; coverage ≥ 80% on new code
- [ ] No secrets in client bundle; service-role + Drive token used server-side only
- [ ] Committed in small steps with conventional-commit messages
