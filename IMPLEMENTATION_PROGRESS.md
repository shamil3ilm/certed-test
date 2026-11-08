# Cert-Ed Academia — Implementation Progress & Reference

**Last Updated**: 2026-11-08  
**Status**: Active / In Progress  
**Environment**: Next.js App Router (16.x), React 19, TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind CSS

---

## 1. Architectural Overview & Project Structure

Cert-Ed Academia LMS is an enterprise-grade academic management system designed with strict role-based access control, Row-Level Security (RLS) enforcement, and server actions.

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

The current cycle focuses on finalizing the multi-dimensional teaching and student hours breakdown, streamlining UI action menus with responsive 3-dot dropdown disclosures, and enforcing strict privilege-boundary link isolation:

| Area                          | Modified Files                                                                                                                                                                                  | Purpose & Status                                                                                                                                                                                                                                             |
| :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hours Engine (Attendance)** | `src/lib/attendance/hours-breakdown.ts`                                                                                                                                                         | Multi-dimensional aggregation: nested breakdowns of **subject -> tutor** and **tutor -> subject** for students; and **student -> subject** and **subject -> student** for educators. _(Completed & Tested)_                                                  |
| **Hours Service Layer**       | `src/lib/services/hours-breakdown.ts`                                                                                                                                                           | Enriches raw aggregates with authenticated subject names and user profile names via `nameThem` and `getMenteesHoursReceived`. _(Completed & Tested)_                                                                                                         |
| **Hours UI Components**       | `src/app/(prt)/HoursTables.tsx`                                                                                                                                                                 | Added `canLinkTutor` and `canLinkStudent` navigation gates, expandable sub-rows in `StudentHoursView`, `PersonHoursView`, `StudentLedger`, and `MenteesHoursTable`. Fully responsive on small & large screens with `overflow-x-auto`. _(Completed & Tested)_ |
| **Hours Pages Integration**   | `src/app/(prt)/admin/teaching-hours/page.tsx`<br>`src/app/(prt)/admin/teaching-hours/person/[id]/page.tsx`<br>`src/app/(prt)/students/[id]/HoursPanel.tsx`<br>`src/app/(prt)/my-hours/page.tsx` | Wired capability-checked linking props: admins can drill into tutor & student detail records, while students/mentors receive plain-text labels to prevent forbidden redirect loops. _(Completed & Tested)_                                                   |
| **Disclosure Dismissal**      | `src/app/(prt)/CloseDisclosureWhenDone.tsx`                                                                                                                                                     | Extended `closeEnclosingDisclosure` to recursively close all parent `<details>` disclosures up the DOM tree, correctly dismissing nested popovers on action completion. _(Completed & Tested)_                                                               |
| **User Administration**       | `src/app/(prt)/admin/users/UserRowActions.tsx`<br>`src/app/(prt)/admin/users/[id]/DetailsCard.tsx`                                                                                              | Grouped actions into a consistent 3-dot kebab menu (`MoreVertical`), eliminated button clutter, added `<CloseDisclosureWhenDone />` to auto-dismiss menus on submit. _(Completed)_                                                                           |
| **Timetable & Slots UI**      | `src/app/(prt)/calendar/timetable/EventRow.tsx`<br>`src/app/(prt)/calendar/timetable/SlotRow.tsx`                                                                                               | Migrated inline toggle/delete buttons to unified 3-dot dropdown disclosures. _(Completed)_                                                                                                                                                                   |
| **Brand Identity & Auth**     | `src/app/(prt)/login/GoogleSignIn.tsx`<br>`src/lib/ui/brand-icons.tsx`<br>`src/lib/ui/index.ts`                                                                                                 | Extracted standalone `GoogleIcon` SVG to `src/lib/ui/brand-icons.tsx` and exported via design system index for complete reusability. _(Completed)_                                                                                                           |
| **Test Verification**         | `tests/unit/hours-breakdown.test.ts`<br>`tests/unit/services/hours-breakdown.test.ts`<br>`tests/unit/disclosure-closes-after-save.test.ts`                                                      | Added unit tests verifying cross-dimensional drill-downs, role attribution, and disclosure auto-close behavior. _(Completed & Passing)_                                                                                                                      |

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

### 3.3. Unclosed Dropdown Disclosures After Action Submit

- **The Mistake**: Submitting a `<form>` or `<ConfirmSubmit>` inside an `<EscapableDetails>` without rendering `<CloseDisclosureWhenDone />`.
- **Why It Fails**: After the server action completes, the disclosure remains open, displaying stale state or blocking other clicks.
- **Rule**: Every `<form>` rendered inside `<EscapableDetails>` must include `<CloseDisclosureWhenDone />`. In nested disclosures, ensure ancestor disclosures are recursively closed. Guarded by `tests/unit/disclosure-closes-after-save.test.ts`.

### 3.4. Privilege-Boundary Routing Leaks (Unauthorized Link Generation)

- **The Mistake**: Unconditionally linking tutor names to `/admin/teaching-hours/person/[id]` (which requires `manageClasses`) or student names to `/students/[id]` (which requires `viewMentees`).
- **Why It Fails**: A student or plain tutor clicking these links hits the destination guard and is bounced to the `?denied=1` screen.
- **Rule**: Only render hyperlinks to routes the current viewer possesses verified capabilities to view. If unprivileged, render plain text.

### 3.5. Service-Role Authority Bypass (RLS Escalation)

- **The Mistake**: Passing an arbitrary caller-supplied `userId` or `studentId` into an RLS-bypassing service function without validating authorization.
- **Why It Fails**: A rogue user could supply another user's ID and fetch private records.
- **Rule**: All service-role queries must verify actor permissions or derive target IDs from authenticated context. Guarded by `tests/unit/service-role-authority.test.ts`.

### 3.6. Vitest Concurrency Timeouts on Windows

- **The Mistake**: Running the entire test suite (`npm test`) on Windows with default timeout (5000ms), causing AST/filesystem-walking tests to fail with `Error: Test timed out in 5000ms`.
- **Why It Happens**: Vitest spawns isolated jsdom environments across CPU cores, and filesystem walks over all files in `src/` and `scripts/` saturate disk I/O.
- **Solution**: Targeted test execution or increasing test timeout for heavy file-scanning tests (`testTimeout: 15000`).

---

## 4. Current Status & Verification Metrics

- **TypeScript Compilation**: Clean pass (`npm run typecheck` returned exit code 0).
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

### Remaining Priorities

- [ ] **Data Export**:
  - [ ] Implement CSV export for hours breakdowns (both student-centric and educator-centric).
  - [ ] Implement PDF report generation for student attendance transcripts.
- [ ] **Finance & Billing Integration**:
  - [ ] Link approved hours totals directly into monthly tutor compensation sheets.
  - [ ] Rate-tier calculations based on session kind (`regular`, `demo`, `exam`).
