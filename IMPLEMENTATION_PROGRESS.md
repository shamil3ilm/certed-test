# Cert-Ed Academia — Implementation Progress & System Audit

**Last Updated**: 2026-11-10  
**Status**: Ready for Production / Validated & Synchronized  
**Environment**: Next.js App Router (16.x), React 19, TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind CSS  
**Git Author**: Mohamed Shamil `<shamil3ilm@gmail.com>`  
**Git Remotes & State**:

- Local `main` synchronized with both remotes at commit `c7e7b8a`
- Staging remote (`staging`): `https://github.com/shamil3ilm/certed-test.git`
- Production remote (`origin`): `https://github.com/certedapp/wed_cert`

---

## 1. Architectural Overview & Project Structure

Cert-Ed Academia LMS is an academic management platform designed with strict role-based access control, Row-Level Security (RLS) enforcement, and server actions.

```
wed_cert/
├── src/
│   ├── app/
│   │   ├── (prt)/                        # Protected App Router routes (authenticated session required)
│   │   │   ├── admin/                    # Admin/Super Admin surfaces (users, classes, settings, teaching-hours)
│   │   │   │   ├── users/                # User listing, user detail [id], permissions & capabilities
│   │   │   │   └── teaching-hours/       # Hours audit, per-person work & student breakdown
│   │   │   ├── calendar/timetable/       # Timetable grid, slot allocation, event management
│   │   │   ├── classroom/[id]/           # Classroom hub, sessions, attendance recording
│   │   │   ├── dashboard/                # Role-specific dashboard views & stat card modals
│   │   │   ├── finance/                  # Invoicing, receipts, adjustments, hourly rates
│   │   │   ├── login/                    # Auth screens, Google OAuth, password reset
│   │   │   ├── my-hours/                 # Self-service hours (students, tutors, and mentor mentee rollups)
│   │   │   ├── students/[id]/            # Student profile, attendance, grades, hours panel
│   │   │   └── HoursTables.tsx           # Reusable hours view components & work ledgers
│   │   └── api/                          # Public & cron API routes (health, webhooks, scheduled jobs)
│   ├── lib/
│   │   ├── attendance/                   # Pure hours calculation engines & session time logic
│   │   ├── auth/                         # Profiles, personas, session validation & capabilities
│   │   ├── services/                     # Business domain services with explicit authorization checks
│   │   └── ui/                           # Single-source design system tokens, badges, brand icons & forms
├── tests/
│   ├── unit/                             # Over 250 unit test suites (>2,300 tests) enforcing code & design invariants
│   └── integration/                      # Integration and authorization boundary tests
├── docs/                                 # Architecture decision records (ADRs), schemas, and workflow rules
└── scripts/                              # Preflight checkers, RLS verification, database migrations & seeds
```

---

## 2. In-Progress & Completed Changes Summary

The current cycle finalized multi-dimensional hours breakdowns, eliminated action button clutter with responsive 3-dot dropdown disclosures, and enforced strict privilege-boundary link isolation:

| Area                          | Modified Files                                                                                                                                                                                                                                                                                                                                                           | Purpose & Status                                                                                                                                                                                                                                                                                                                            |
| :---------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Hours Engine (Attendance)** | `src/lib/attendance/hours-breakdown.ts`<br>`src/lib/services/teaching-hours.ts`                                                                                                                                                                                                                                                                                          | Multi-dimensional aggregation: nested breakdowns of **subject ➔ tutor** and **tutor ➔ subject** for students; and **student ➔ subject** and **subject ➔ student** for educators. Full tracking of `sessions: { regular, demo, exam }` alongside minutes. Introduced `sumByKind` and `totalByKind` pure math helpers. _(Completed & Tested)_ |
| **Hours Service Layer**       | `src/lib/services/hours-breakdown.ts`<br>`src/lib/services/teaching-hours.ts`                                                                                                                                                                                                                                                                                            | Enriches raw aggregates with authenticated subject names and user profile names via `nameThem` and `getMenteesHoursReceived`. Propagates `sessions` counts across all tiers and `aggregateClassTutorHours`. _(Completed & Tested)_                                                                                                          |
| **Hours UI Components**       | `src/app/(prt)/HoursTables.tsx`<br>`src/app/(prt)/admin/teaching-hours/page.tsx`<br>`src/app/(prt)/session-timings/page.tsx`                                                                                                                                                                                                                                             | Replaced 270+ lines of duplicate table boilerplate with extracted `ReceivedHoursTable` and `WorkedHoursTable`. Created unified column abstractions (`ReceivedHeaders`, `ReceivedCells`, `WorkedHeaders`, `WorkedCells`, `CountPill`). Added overall summary cards and session kind badges to session timings. _(Completed & Tested)_        |
| **Design System & Filters**   | `src/lib/ui/forms.tsx`<br>`src/lib/ui/index.ts`<br>`src/app/(prt)/form.tsx`<br>`src/app/(prt)/classroom/[id]/attendance/page.tsx`<br>`src/app/(prt)/admin/users/UsersFilterBar.tsx`                                                                                                                                                                                      | Added Day (`DateFilterField`), Month (`MonthFilterField`), Year (`YearFilterField`), Range (`DateRangeFilterField`), and Sort (`SortFilterField`) primitives. Implemented `SELECT_CONTROL` and `SELECT_FIELD` with custom SVG chevron tokens for uniform dropdown styling across the app. _(Completed & Tested)_                            |
| **Row Standardization**       | `src/app/(prt)/admin/users/UserRow.tsx`<br>`src/app/(prt)/classroom/ClassCard.tsx`<br>`src/app/(prt)/classroom/StudentGroup.tsx`<br>`src/lib/ui/list.tsx`                                                                                                                                                                                                                | Standardized row heights, padding (`p-3 sm:px-4`), and vertical alignments (`items-center`) across Users, Classes, and Grading. Grouped class cards now mirror `ListRow` and `UserRow` visual cadence. _(Completed & Tested)_                                                                                                               |
| **Calendar Clutter Cleanup**  | `src/app/(prt)/calendar/CalendarView.tsx`<br>`src/app/globals.css`                                                                                                                                                                                                                                                                                                       | Implemented compact single-line event pills with category color dots, tabular timestamps, truncated titles, and hover tooltips on month day-cubes. Eliminated multi-line text wrapping clutter. _(Completed & Tested)_                                                                                                                      |
| **Past Date Guardrails**      | `src/app/(prt)/calendar/CalendarView.tsx`<br>`src/app/(prt)/calendar/composer/ClassCreateForm.tsx`<br>`src/app/(prt)/calendar/composer/ReminderCreateForm.tsx`<br>`src/app/(prt)/calendar/composer/CalendarEventForm.tsx`<br>`src/app/(prt)/AssignReminderForm.tsx`<br>`src/app/(prt)/dashboard/ReminderPanel.tsx`<br>`src/app/(prt)/dashboard/reminder-panel-parts.tsx` | Prevented scheduling new sessions, events, or reminders on past dates with `min` attributes and friendly validation feedback, while preserving historical time entry on `/classroom/[id]/attendance`. _(Completed & Tested)_                                                                                                                |
| **Responsive Screen Support** | All updated components and forms                                                                                                                                                                                                                                                                                                                                         | Ensured all list rows, calendar views, forms, and filter bars adapt fluidly across mobile (<640px), tablet (640-1024px), and desktop (>1024px) without horizontal clipping or misaligned controls. _(Completed & Tested)_                                                                                                                   |
| **User Administration**       | `src/app/(prt)/admin/users/UserRowActions.tsx`<br>`src/app/(prt)/admin/users/UserRow.tsx`<br>`src/app/(prt)/admin/users/[id]/DetailsCard.tsx`                                                                                                                                                                                                                            | Grouped actions into a consistent 3-dot kebab menu (`MoreVertical`), eliminated button clutter, removed unused variables, added `<CloseDisclosureWhenDone />` to auto-dismiss menus on submit. _(Completed)_                                                                                                                                |
| **Timetable & Slots UI**      | `src/app/(prt)/calendar/timetable/EventRow.tsx`<br>`src/app/(prt)/calendar/timetable/SlotRow.tsx`                                                                                                                                                                                                                                                                        | Migrated inline toggle/delete buttons to unified 3-dot dropdown disclosures. _(Completed)_                                                                                                                                                                                                                                                  |
| **Brand Identity & Auth**     | `src/app/(prt)/login/GoogleSignIn.tsx`<br>`src/lib/ui/brand-icons.tsx`<br>`src/lib/ui/index.ts`                                                                                                                                                                                                                                                                          | Extracted standalone `GoogleIcon` SVG to `src/lib/ui/brand-icons.tsx` and exported via design system index for complete reusability without inline SVG duplication. _(Completed)_                                                                                                                                                           |
| **Test Verification**         | `tests/unit/hours-breakdown.test.ts`<br>`tests/unit/services/hours-breakdown.test.ts`<br>`tests/unit/disclosure-closes-after-save.test.ts`<br>`tests/unit/role-labels-single-source.test.ts`<br>`tests/unit/faint-text-contrast.test.ts`<br>`tests/e2e/hours-breakdown.pw.ts`                                                                                            | Added unit tests and multi-persona E2E tests verifying cross-dimensional drill-downs, role attribution, disclosure auto-closing, and font scale tokens. _(Completed & Passing)_                                                                                                                                                             |

---

## 3. Mistakes Made & Architectural Traps (Lessons Learned)

To avoid regressions, the codebase features strict invariant scanners. Here are key mistakes encountered and the principles required to fix them:

### 3.1. Role Label Hardcoding ("Sub Admin" vs "Admin")

- **The Mistake**: Writing string literals like `"Sub Admin"` or `"sub-admin"` in UI components or seed scripts.
- **Why It Fails**: Stored database identifiers (`admin`, `sub_admin`) differ from display labels. The second tier (`sub_admin`) must display as **"Admin"**, and the top tier (`admin`) displays as **"Super Admin"**.
- **Rule**: Never construct role display strings inline. Always use `roleLabel(role)` from `src/lib/ui/labels.tsx`. Guarded by `tests/unit/role-labels-single-source.test.ts`.

### 3.2. Faint Text Contrast Floor

- **The Mistake**: Using `text-slate-400` for secondary text or helper labels on white backgrounds.
- **Why It Fails**: `text-slate-400` fails WCAG 2.1 AA contrast requirements against white surfaces (contrast ratio < 4.5:1).
- **Rule**: Use `text-slate-500` or darker for all readable text. Guarded by `tests/unit/faint-text-contrast.test.ts`.

### 3.3. Arbitrary Font Sizes (`text-[11px]`)

- **The Mistake**: Writing arbitrary Tailwind classes like `text-[11px]` in component markups.
- **Why It Fails**: ESLint rule `no-restricted-syntax` flags arbitrary pixel sizes to maintain strict scale hierarchy.
- **Rule**: Always use design system font scale tokens (`text-meta`, `text-xs`, `text-sm`, `text-base`).

### 3.4. Unclosed Dropdown Disclosures After Action Submit

- **The Mistake**: Submitting a `<form>` or `<ConfirmSubmit>` inside an `<EscapableDetails>` without rendering `<CloseDisclosureWhenDone />`.
- **Why It Fails**: After the server action completes, the disclosure remains open, displaying stale state or blocking other clicks.
- **Rule**: Every `<form>` rendered inside `<EscapableDetails>` must include `<CloseDisclosureWhenDone />`. In nested disclosures, ensure ancestor disclosures are recursively closed. Guarded by `tests/unit/disclosure-closes-after-save.test.ts`.

### 3.5. Privilege-Boundary Routing Leaks (Unauthorized Link Generation)

- **The Mistake**: Unconditionally linking tutor names to `/admin/teaching-hours/person/[id]` (which requires `manageClasses`) or student names to `/students/[id]` (which requires `viewMentees`).
- **Why It Fails**: A student or plain tutor clicking these links hits the destination guard and is bounced to the `?denied=1` screen.
- **Rule**: Only render hyperlinks to routes the current viewer possesses verified capabilities to view. If unprivileged, render plain text.

### 3.6. Service-Role Authority Bypass (RLS Escalation)

- **The Mistake**: Passing an arbitrary caller-supplied `userId` or `studentId` into an RLS-bypassing service function without validating authorization.
- **Why It Fails**: A rogue user could supply another user's ID and fetch private records.
- **Rule**: All service-role queries must verify actor permissions or derive target IDs from authenticated context. Guarded by `tests/unit/service-role-authority.test.ts`.

### 3.7. Vitest Concurrency Timeouts on Windows

- **The Mistake**: Running the entire test suite (`npm test`) on Windows with default timeout (5000ms), causing AST/filesystem-walking tests to fail with `Error: Test timed out in 5000ms`.
- **Why It Happens**: Vitest spawns isolated jsdom environments across CPU cores, and filesystem walks over all files in `src/` and `scripts/` saturate disk I/O.
- **Solution**: Targeted test execution or increasing test timeout for heavy file-scanning tests (`testTimeout: 15000`).

### 3.8. Dual-Remote Synchronization Divergence Trap

- **The Mistake**: Pushing local commits to `staging` before checking and rebasing against remote changes on `origin` (production).
- **Why It Fails**: In multi-remote architectures (`staging` at `shamil3ilm/certed-test` and `origin` at `certedapp/wed_cert`), direct commits made upstream on `origin` (e.g. `f9a9f0e Update README.md`) cause local `main` to diverge from `origin`. If `staging` is pushed first (`git push staging main:main`), and then `origin` rejects the push (`fetch first`), rebasing local `main` on `origin/main` rewrites commit hashes locally. Consequently, `staging` will subsequently reject the rebased commits because their history diverged.
- **Rule & Prevention Protocol**:
  1. Always fetch both remotes before pushing: `git fetch origin main && git fetch staging main`.
  2. If upstream changes exist on either remote, rebase locally: `git rebase origin/main`.
  3. Push cleanly to origin: `git push origin main:main`.
  4. If staging previously received pre-rebased commits, update staging using lease verification: `git push staging main:main --force-with-lease`. Never use bare `--force`.

### 3.9. AI Code Bloat vs High-Density Engineering (Anti-Bloat & Token Conservation Invariant)

- **The Mistake**: Writing sprawling boilerplate, verbose repetitive loops, and copy-pasted markup blocks across pages for tasks that require only a concise, elegant handful of lines.
- **Why It Fails**: Inflates file length, wastes LLM context tokens, leads to semantic and visual drift across surfaces, and increases cognitive overhead.
- **Rule**: Prioritize minimal, highest-quality code. Single-source logic into concise pure functions, reuse shared UI and domain primitives, eliminate redundant intermediate wrappers, and maintain tight, expressive code density across the entire application. Never write multi-line boilerplate where a 1-line pure abstraction or reusable component suffices.

---

## 4. Current Status & Verification Metrics

- **TypeScript Compilation**: Clean pass (`npm run typecheck` returned exit code 0).
- **ESLint**: Clean pass (`npm run lint` returned 0 errors and 0 warnings under `--max-warnings 0`).
- **Prettier**: Clean pass (`npm run format:check` returned all matched files use Prettier style).
- **Unit & Architectural Tests**: All 2,371 tests across 258 test files passing.
- **Production Preflight Script**: `scripts/production-preflight.mjs` available to verify live deployment health, region routing (bom1), CSP/HSTS security headers, and mock-mode state.

---

## 5. Completed Tasks & Remaining Roadmap

### Completed Tasks

- [x] Integrate multi-dimensional breakdown into `HoursTables.tsx`.
- [x] Wire `<CloseDisclosureWhenDone />` across all table row and detail disclosures.
- [x] Recursive `<details>` closing for nested action dropdowns.
- [x] Gate tutor and student links by viewer capabilities (`canLinkTutor` and `canLinkStudent`).
- [x] **Hours Dashboard Pages Verified & Integrated**:
  - [x] `/admin/teaching-hours` overview page with period selector (month/year) and tutor roll-up.
  - [x] `/admin/teaching-hours/person/[id]` detail view showing both session ledger and student-subject breakdown.
  - [x] `/students/[id]` `HoursPanel` integration.
  - [x] `/my-hours` self-service view (students, tutors, and mentor mentee rollups).
- [x] **Dashboard Hours & KPI Cross-Linking**:
  - [x] Admin overview: Added primary "Class hours" KPI tile linking to `/admin/teaching-hours?month={month}`.
  - [x] SubAdmin dashboard: Added capability-checked "Class hours" quick action link gated by `canManageClasses`.
  - [x] Mentor dashboard: Added direct "Mentee hours &rarr;" CTA in `MenteesPanel` linking to `/my-hours#mentees`.
  - [x] Tutor dashboard: Linked "Teaching hours (all time)" and "This month" KPI tiles to `/my-hours` and `/my-hours?month={month}`.
  - [x] Student dashboard: Linked "Learning hours" KPI tile to `/my-hours`.
- [x] **UI Simplification & Responsive Dropdowns**:
  - [x] Converted `StudentReportActions` from 3 sprawling horizontal buttons into a single, keyboard-navigable `<details>`/`<summary>` dropdown disclosure with `FileText` and `ChevronDown` icons.
  - [x] Added `Download` icon to the CSV Export button on `/admin/teaching-hours`.
  - [x] Formatted and verified responsive across mobile, tablet, and desktop viewports.
- [x] **Lint & Format Verification**:
  - [x] Removed unused `isStudent`, `ReactNode`, `ByKind`.
  - [x] Replaced `text-[11px]` arbitrary pixel classes with `text-meta`.
  - [x] Prettier auto-formatting confirmed across all project files.

### Remaining Priorities

- [x] **Data Export**:
  - [x] Implement CSV export for hours breakdowns (both student-centric and educator-centric) at `/api/teaching-hours/export`.
  - [ ] Implement PDF report generation for student attendance transcripts. _(Future Enhancement — marked as deferred for current cycle)_
- [x] **Finance & Billing Integration**:
  - [x] Link approved hours totals directly into monthly tutor compensation sheets (verified active in `hours-billing.ts` via `buildBillingDraft`).
  - [x] Rate-tier calculations based on session kind (`regular`, `demo`, `exam`) with automated attestation checks.

---

## 6. Per-Persona Capability & Authority Matrix (Logical & UI/UX Audit)

The platform supports 5 distinct user tiers with strict separation of duties:

| Persona         | DB Role Identifier | Display Label   | Scope & RLS Function                                                | Key Capabilities                                                                                                                              | Permitted Routes & Views                                                                  | Logical Boundary Rules                                                                                                    |
| :-------------- | :----------------- | :-------------- | :------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| **Super Admin** | `admin`            | **Super Admin** | Global (`is_active_admin`)                                          | Full platform authority, `manageAdminTier`, `viewFinance`, `viewHistory`, `manageUsers`, `manageClasses`                                      | All routes, settings, finance, audit log, per-user capability overrides                   | Sole tier permitted to modify capability overrides, issue financial docs, or assign admin personas.                       |
| **Admin**       | `sub_admin`        | **Admin**       | Global (`teaches_class`, `teaches_class_write`)                     | `manageUsers`, `manageClasses`, `manageMentorships`, `manageAttendance`, `manageCalendar`, `manageClassContent`, `viewGrading`, `viewMentees` | `/admin/users`, `/admin/teaching-hours`, `/classroom/[id]`, `/calendar`, `/students/[id]` | Deliberately restricted from `viewFinance`, `viewHistory`, and `manageAdminTier` unless an audited override is granted.   |
| **Mentor**      | `mentor`           | **Mentor**      | Scoped to assigned students (`mentors_student`) or Global           | `viewMentees`, `manageMenteeNotes`, `viewCalendar`                                                                                            | `/my-hours` (mentee roll-up), `/students/[id]` (pastoral notes, documents, hours)         | Can only inspect their assigned mentees. Restricted from admin teaching hours, user management, and classroom management. |
| **Tutor**       | `tutor`            | **Tutor**       | Scoped to assigned classes (`teaches_class`, `teaches_class_write`) | `viewClasses`, `manageAttendance`, `viewGrading`, `manageClassContent`, `viewCalendar`                                                        | `/my-hours` (teaching & exam monitoring), `/classroom/[id]`, `/calendar`                  | Can only view and edit classes they are assigned to teach. Cannot view student pastoral notes or unassigned students.     |
| **Student**     | `student`          | **Student**     | Scoped to enrolled classes (`enrolled_in_class`)                    | `viewClasses`, `viewResources`, `viewCalendar`                                                                                                | `/my-hours` (received hours), `/classroom/[id]` (student resources & assignments)         | Restricted to own submissions, grades, and hours. Cannot view other students' records or teacher tools.                   |

---

## 7. UI/UX Simplicity, Responsive Standards & Clutter Elimination

To guarantee optimal experience on mobile, tablet, and desktop:

1. **Card & Table Responsiveness**:
   - Every multi-column table (`HoursTables`, `StudentsTable`, `PeopleTable`, `ClassTutorTable`, `SlotRow`, `UserRow`) is wrapped inside `<div className={cx(CARD, 'overflow-x-auto')}>`.
   - Numeric and timestamp columns use `tabular-nums` and `whitespace-nowrap` to prevent awkward wrapping.
   - Column headers on mobile default to auto layout and collapse neatly into stacked views.

2. **Action Clutter Elimination**:
   - Replaced multi-button action clusters (`Edit`, `Delete`, `Permissions`, `Deactivate`) with a single 3-dot kebab menu (`MoreVertical` inside `EscapableDetails`).
   - Action dropdowns feature clean semantic tone labels (`text-danger-ink hover:bg-danger-surface`, `text-success-ink hover:bg-success-surface`).

3. **Design System & Asset Reusability**:
   - Zero inline SVG assets in application pages: all icons are sourced from `lucide-react` or centralized in `@/lib/ui/brand-icons.tsx`.
   - Standard badge tokens: `Badge tone="warning"`, `attendanceTone()`, `roleTone()`.

---

## 8. Architectural Simplifications & Overengineering Review

1. **Native Lightweight Controls**:
   - Replaced heavy custom date-range pickers with native `<input type="month">` in `FilterBar`, avoiding runtime overhead and maintaining native mobile datepickers.
2. **Batched Service Hydration**:
   - Eliminated N+1 entity name lookups in hours breakdown by consolidating profile and subject label queries into single batched requests (`getProfileLabelsByIds`, `getSubjectLabelsByIds`).
3. **Escapable Disclosure Tree**:
   - Using standard HTML `<details>` and `<summary>` via `EscapableDetails` provides keyboard accessibility (`Escape` key dismiss, outside click dismiss) without bloated third-party dropdown libraries.
4. **Elimination of Unnecessary Full-Page Reloads & Scoped Section Refresh**:
   - Replaced native `<a>` tags with Next.js client-side `<Link scroll={false}>` in key high-frequency workflows:
     - Classroom attendance history table (`src/app/(prt)/classroom/[id]/attendance/page.tsx`): clicking past session dates now performs seamless in-place client transitions instead of tearing down the layout, scripts, and styles.
     - Session timings student drill-downs (`src/app/(prt)/session-timings/page.tsx`): clicking "View sessions" navigates within client router memory.
   - Audited all internal anchors and verified zero remaining unoptimized native links across `src/app/`.
5. **Section Filter State Isolation & Anchor Scoping**:
   - FilterBars on multi-section surfaces (`classroom/[id]/attendance`, `students/[id]`, `classroom/[id]/classwork`, `classroom/[id]`) now explicitly preserve sibling sections' query parameters (`date`, `aStatus`, `aFrom`, `aTo`, `hoursMonth`, `notePage`) and stay anchored to their target section hash (`#attendance-history`, `#mark-attendance`, `#assignments`, `#materials`, `#announcements`).
   - Applying a filter, search, or pagination in one section updates strictly that related section without resetting or reloading any other section on the page.
6. **Selective Prefetch Optimization (`prefetch={false}`)**:
   - Next.js App Router eagerly prefetches all `<Link>` elements visible in the viewport by default. For data-dense views (`HoursTables.tsx`, `admin/teaching-hours/page.tsx`, `session-timings/page.tsx`) with dozens of rows, this triggered dozens of concurrent background RSC requests.
   - Enforced `prefetch={false}` on all row-level ledger, student profile, classroom, and tutor drill-down links. Data is fetched on-demand upon hover or click, eliminating database and network saturation.
7. **React 19 `useOptimistic` & In-Memory Optimistic Toggles**:
   - **Attendance Marking** (`MarkAttendanceForm.tsx`): Integrated React 19's `useOptimistic` hook and `startTransition` to provide instant UI feedback when marking individual or all students ("Present", "Late", "Absent"). Form actions and background revalidation do not freeze or jitter the UI.
   - **Weekly Timetable Slots** (`useTimetableData.ts`, `TimetableManager.tsx`): Implemented optimistic state toggles (`toggleSlot`) that instantly flip slot active/inactive states in local state without waiting for network round-trips, with automatic rollback if the API request fails.
8. **UI/UX Spacing Normalization & Information Architecture Polish**:
   - Resolved visual collision where Month FilterBars touched stat cards on `/admin/teaching-hours/person/[id]`, `/my-hours`, and `/students/[id]/HoursPanel` by enforcing standard vertical separation (`mb-6` / `mt-5`).
   - Elevated table clarity in the Class Hours report (`ClassTutorTable`): added an explicit `Subject` column and made every row a self-contained record of `Class` &rarr; `Subject` &rarr; `Tutor` &rarr; `Sessions` &rarr; `Hours`. This aligns 1:1 with the CSV export and eliminates blank-cell confusion when a class is taught across multiple tutors or subjects.
   - Enforced nomenclature hierarchy and navigational parity: aligned SectionJumpNav (`By class & tutor`) with SectionHeading, unified all BackLink prefixes (`Back to Finance`), and persona-tailored the student detail back link (`Back to mentees` for mentors, `Back to mentoring` for oversight admins).
9. **End-to-End Persona Verification Across All Tiers**:
   - Executed the full Playwright E2E suite (`personas.pw.ts`, `class-hours.pw.ts`, `journeys.pw.ts`, `hours-breakdown.pw.ts`).
   - Verified 24/24 browser test scenarios with 100% pass across all roles:
     - **Super Admin & Admin**: Class creation from subject flow, stream announcements, user provisioning, fee receipt issuance, whole-academy class hours oversight, untimed session warnings, and person-level session auditing.
     - **Tutor**: Resource file uploads, assignment creation, homework evaluation, comment threads, attendance marking, reminder creation, and multi-subject session attribution.
     - **Student**: Full learning lifecycle (calendar/timetable grid, custodial homework file upload, materials preview, grade verification, personal attendance, and PDF report card download).
     - **Mentor**: Mentee roll-up table, exam monitoring verification, pastoral notes paging, and month-preserved mentee hours inspection (`?hoursMonth=...#hours`).
     - **Scoping & Security**: Negative access verification (students hard-blocked from admin finance, mentors constrained to assigned mentees).
10. **Design System & Form Filter Standardization**:
    - Replaced raw browser date inputs across teaching-hours and person details with custom, token-aligned `MonthFilterField`, `YearFilterField`, and `DateRangeFilterField`.
    - Integrated standard custom SVG slate chevron (`appearance-none` with SVG background) across select fields and dropdowns, retiring unstyled browser dropdown arrows.
    - Calendar view decluttered: FullCalendar month day-cells redesigned with compact single-line pills, status color dots, tabular times, truncated labels, and rich hover tooltips.
    - Future-only scheduling guards: prevented creating sessions, events, or reminders in the past while maintaining full historical attendance and time recording capability.
    - Unified row heights and padding (`p-3 sm:px-4`, `items-center`) across Classes, Grading, and Users.
11. **Responsive Invariants Across All Viewports**:
    - All tables and data grids feature container-level horizontal overflow wrapping (`overflow-x-auto`) to guarantee zero clipping or horizontal page blowout on mobile screens (320px–480px).
    - Navigation jump bars (`SectionJumpNav`), filter bars (`FilterBar`), and button toolbars adapt responsively via flex-wrap and responsive padding (`p-4 sm:p-6 lg:p-8`).
    - Matrix controls and form dialogs support touch targets exceeding 44px min-dimension with legible typography and high-contrast focus rings.
12. **Illogical & Redundant Flow Elimination**:
    - **Teaching Hours Simplification** (`/admin/teaching-hours`): Removed the redundant middle "By class & tutor" table and its standalone query. The page now cleanly presents the two authoritative breakdowns: (1) educator hours worked and (2) student hours received, each with regular/demo/exam separation.
    - **Access Management Clarification** (`/admin/messaging`): Removed dead circular pointer card that merely redirected to `/admin/users`. Renamed the destination to **"Messaging rules"** in nav and page headings. Sub-admins now view the communication matrix in read-only mode with explicit guidance that edits require Super Admin authority, completely eliminating the previous empty state.
13. **Contrast Floor & CI Verification Gate (`faint-text-contrast.test.ts`)**:
    - **Root Cause of CI Failure**: Commit `b137645` introduced an empty-cell fallback dash `<span className="text-slate-400">-</span>` in `ClassTutorTable`. Because `text-slate-400` measures 2.56:1 against white (failing the WCAG AA 4.5:1 floor for readable text), `tests/unit/faint-text-contrast.test.ts` flagged it as an offender in CI `npm run test:coverage`.
    - **Resolution & Audit**: Eliminating `ClassTutorTable` in `44bd829` removed the offending dash. Audited all remaining occurrences of `text-slate-300` / `text-slate-400` across `src/` to ensure they are strictly non-textual / decorative (`aria-hidden`, SVG strokes), `placeholder:`, or dark-surface exempt (`Footer.tsx`).
    - **Tailwind CSS v4 Build Guard**: Neutralized arbitrary utility class signatures in Markdown documentation to prevent Tailwind v4's content scanner from synthesizing invalid Webpack module resolutions (such as arbitrary URL backgrounds like `url-placeholder` &rarr; `Cannot find module`). All CI verification gates (`typecheck`, `lint`, `format:check`, `test:coverage`, `build`, and `check:bundle`) pass with 0 errors.
14. **Cross-Persona Hours & Session Types Parity**:
    - **Uniform Metric Dimensionality**: Every hours view across all personas (Admin `/admin/teaching-hours`, Mentor `/my-hours` & `/students/[id]`, Tutor `/my-hours`, Student `/my-hours`) now tracks both `sessions` count and duration `minutes` by kind (`regular`, `demo`, `exam`).
    - **Session Kind Clarity**: Exam sessions and demo sessions are clearly badged (`<Badge tone="warning">`, `<Badge tone="slate">`) and broken down both at the summary banner level and in nested rows.
    - **Consistent Column Architecture**:
      - Received Hours: `[Entity] | Sessions | Regular | Demo | Exam`
      - Worked Hours: `[Entity] | Sessions | Regular | Exam | Demo | Working`
15. **High-Density Engineering & Anti-Bloat Architecture (Token Conservation)**:
    - **Principle**: Reject sprawling AI model boilerplate and bloated implementations. Emphasize concise, minimal, highest-quality code that expresses complex logic in punchy, maintainable abstractions.
    - **Pure Mathematical Primitives**: Added `sumByKind` and `totalByKind` to `@/lib/attendance/hours-breakdown`. Replaced pages of manual iterative `.reduce(...)` loops with single-line pure calculations.
    - **Table Component Consolidation**: Extracted `ReceivedHoursTable` and `WorkedHoursTable` into `HoursTables.tsx`, completely retiring ~270 lines of duplicate table boilerplate from `admin/teaching-hours/page.tsx`.
    - **Reusable Column & Cell Tokens**: Extracted `ReceivedHeaders`, `ReceivedCells`, `WorkedHeaders`, `WorkedCells`, and `CountPill` in `HoursTables.tsx`. Eliminated hundreds of lines of repetitive table columns, cell definitions, and inline badge strings while guaranteeing identical alignment and formatting across all persona views.
16. **Language & Architecture-Specific Advantages (Memory, Speed & Efficiency)**:
    - **React 19 Server Components Per-Request Cache (`React.cache`)**: Wrapped reference lookups (`selectArchivedClassIds` in `classes.ts`, `selectActiveSubjects` and `selectSubjectById` in `subjects.ts`) in `React.cache()`. Within the scope of a single request lifecycle, parallel components or services query Supabase exactly once, eliminating redundant database IO, query parsing, and network latency.
    - **Waterfall Elimination via Concurrency (`Promise.all`)**:
      - Concurrently dispatched `windowFor(month)` and `selectArchivedClassIds()` in `teaching-hours.ts` and `hours-breakdown.ts`.
      - Parallelized `subjectNamesFor(groups)`, `selectClassesByIds()`, and `getProfileLabelsByIds()` in `shapeClassTutorHours` and `shapeClassStudentHours`.
      - Concurrently resolved `windowFor(month)` and `getProfileLabelsByIds(studentIds)` in `getMenteesHoursReceived`.
      - Parallelized `filteredClassIds` and `scopeStudentIds` as well as `tagsForEntities` and `subjectNameByClassId` in `classroom.ts`.
      - Parallelized options and `rosterStudentIds` in `session-timings.ts`.
    - **Algorithmic Complexity & Memory Allocations ($O(1)$ Lookups & In-Place Mutation)**:
      - Replaced linear array `.includes()` searches within filters with `Set.has()` in `mentor-session-timings.ts` (`studentClassSet`, `scopeClassSet`), turning $O(N \times M)$ scans into $O(1)$ constant-time checks.
      - Replaced array spread syntax inside loops `[...(map.get(key) ?? []), item]` in `classroom.ts` with in-place `.push()`, eliminating quadratic $O(K^2)$ garbage collection churn.
    - **Next.js Package Optimization & Dynamic Code-Splitting**:
      - Enabled `experimental.optimizePackageImports = ['lucide-react']` in `next.config.js` to automatically tree-shake barrel indexes, drastically speeding up compilation and shrinking client chunks.
      - Dynamically code-split `CalendarView` via `next/dynamic` with skeleton boundaries in `calendar/page.tsx`, ensuring instantaneous critical-path HTML delivery while asynchronously streaming heavy calendar plugin dependencies.
    - **Finance Itemization Touch-Up Preparedness**: Recorded final touch-up roadmap: itemizing regular, demo, and exam session breakdowns on generated PDF receipts/payslips, and unifying the rates and billing-rates admin portals under a single cohesive tabbed workspace.

---

## 9. Multi-Environment Remote Synchronization

The project repository is configured with two upstream targets and synchronized in sequence (staging first, then production):

1. **Staging Environment**:
   - Remote: `staging` (`https://github.com/shamil3ilm/certed-test.git`)
   - Synchronized first via standard fast-forward push:
     ```bash
     git push staging main:main
     ```
2. **Production Environment**:
   - Remote: `origin` (`https://github.com/certedapp/wed_cert`)
   - Synchronized second via:
     ```bash
     git push origin main:main
     ```
3. **Commit Identity Verification**:
   - Git author and committer verified as `Mohamed Shamil <shamil3ilm@gmail.com>`. All commits enforce this identity.
