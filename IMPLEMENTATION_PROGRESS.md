# Cert-Ed Academia — Implementation Progress & System Audit

**Last Updated**: 2026-11-08  
**Status**: Ready for Production / Validated  
**Environment**: Next.js App Router (16.x), React 19, TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind CSS  
**Git Branches**:

- Local `main` rebased cleanly on top of `origin/main` (`f9a9f0e`)
- Commit: `0264727 feat: complete multi-dimensional hours breakdown, privilege-gated navigation, and responsive UI actions`
- Staging remote: `https://github.com/shamil3ilm/certed-test.git`
- Production remote: `https://github.com/certedapp/wed_cert`

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

| Area                          | Modified Files                                                                                                                                                                                                                           | Purpose & Status                                                                                                                                                                                                                                                       |
| :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hours Engine (Attendance)** | `src/lib/attendance/hours-breakdown.ts`                                                                                                                                                                                                  | Multi-dimensional aggregation: nested breakdowns of **subject ➔ tutor** and **tutor ➔ subject** for students; and **student ➔ subject** and **subject ➔ student** for educators. _(Completed & Tested)_                                                                |
| **Hours Service Layer**       | `src/lib/services/hours-breakdown.ts`                                                                                                                                                                                                    | Enriches raw aggregates with authenticated subject names and user profile names via `nameThem` and `getMenteesHoursReceived`. _(Completed & Tested)_                                                                                                                   |
| **Hours UI Components**       | `src/app/(prt)/HoursTables.tsx`                                                                                                                                                                                                          | Added `canLinkTutor` and `canLinkStudent` navigation gates, expandable sub-rows in `StudentHoursView`, `PersonHoursView`, `StudentLedger`, and `MenteesHoursTable`. Fully responsive across mobile, tablet, and desktop with `overflow-x-auto`. _(Completed & Tested)_ |
| **Hours Pages Integration**   | `src/app/(prt)/admin/teaching-hours/page.tsx`<br>`src/app/(prt)/admin/teaching-hours/person/[id]/page.tsx`<br>`src/app/(prt)/students/[id]/HoursPanel.tsx`<br>`src/app/(prt)/my-hours/page.tsx`                                          | Wired capability-checked linking props: admins can drill into tutor & student detail records, while students/mentors receive plain-text labels to prevent forbidden redirect loops. _(Completed & Tested)_                                                             |
| **Disclosure Dismissal**      | `src/app/(prt)/CloseDisclosureWhenDone.tsx`                                                                                                                                                                                              | Extended `closeEnclosingDisclosure` to recursively close all parent `<details>` disclosures up the DOM tree, correctly dismissing nested popovers on action completion. _(Completed & Tested)_                                                                         |
| **User Administration**       | `src/app/(prt)/admin/users/UserRowActions.tsx`<br>`src/app/(prt)/admin/users/UserRow.tsx`<br>`src/app/(prt)/admin/users/[id]/DetailsCard.tsx`                                                                                            | Grouped actions into a consistent 3-dot kebab menu (`MoreVertical`), eliminated button clutter, removed unused variables, added `<CloseDisclosureWhenDone />` to auto-dismiss menus on submit. _(Completed)_                                                           |
| **Timetable & Slots UI**      | `src/app/(prt)/calendar/timetable/EventRow.tsx`<br>`src/app/(prt)/calendar/timetable/SlotRow.tsx`                                                                                                                                        | Migrated inline toggle/delete buttons to unified 3-dot dropdown disclosures. _(Completed)_                                                                                                                                                                             |
| **Brand Identity & Auth**     | `src/app/(prt)/login/GoogleSignIn.tsx`<br>`src/lib/ui/brand-icons.tsx`<br>`src/lib/ui/index.ts`                                                                                                                                          | Extracted standalone `GoogleIcon` SVG to `src/lib/ui/brand-icons.tsx` and exported via design system index for complete reusability without inline SVG duplication. _(Completed)_                                                                                      |
| **Test Verification**         | `tests/unit/hours-breakdown.test.ts`<br>`tests/unit/services/hours-breakdown.test.ts`<br>`tests/unit/disclosure-closes-after-save.test.ts`<br>`tests/unit/role-labels-single-source.test.ts`<br>`tests/unit/faint-text-contrast.test.ts` | Added unit tests verifying cross-dimensional drill-downs, role attribution, disclosure auto-closing, and font scale tokens. _(Completed & Passing)_                                                                                                                    |

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
- [x] **Lint & Format Verification**:
  - [x] Removed unused `isStudent`, `ReactNode`, `ByKind`.
  - [x] Replaced `text-[11px]` arbitrary pixel classes with `text-meta`.
  - [x] Prettier auto-formatting confirmed across all project files.

### Remaining Priorities

- [ ] **Data Export**:
  - [ ] Implement CSV export for hours breakdowns (both student-centric and educator-centric).
  - [ ] Implement PDF report generation for student attendance transcripts.
- [ ] **Finance & Billing Integration**:
  - [ ] Link approved hours totals directly into monthly tutor compensation sheets.
  - [ ] Rate-tier calculations based on session kind (`regular`, `demo`, `exam`).

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

---

## 9. Multi-Environment Remote Synchronization

The project repository is configured with two upstream targets:

1. **Staging Environment**:
   - Remote: `staging` (`https://github.com/shamil3ilm/certed-test.git`)
   - Status: Up to date (`267f106..22bc433` pushed).
2. **Production Environment**:
   - Remote: `origin` (`https://github.com/certedapp/wed_cert`)
   - Remote commit `f9a9f0e` (`Update README.md`) has been cleanly fetched and rebased locally.
   - Local `main` commit `0264727` is ready to be pushed to both remotes via:
     ```bash
     git push origin main:main
     git push staging main:main
     ```
