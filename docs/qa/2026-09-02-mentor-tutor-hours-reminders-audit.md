# Audit — Mentor / Tutor / Session-Time / Teaching-Hours / Reminder Permissions

**Date:** 2026-09-02
**Scope:** the requirements in the "Comprehensive Audit Prompt". This is a **post-implementation verification**: most of the requested behaviour has been built and tested this cycle, so each item below is checked against the _current_ code with file:line evidence, and the residual items are flagged as business decisions.

---

## 1. Executive Summary

The requirements are valid and the architecture supports them cleanly. The app already had the right primitives — an app-layer persona/capability model over Supabase RLS, a single `minutesBetween` teaching-hour building block, and class-scoped authorization helpers — so the work was **reuse + scope**, not a rewrite.

State: **all P0/P1 items are implemented, server-authorized, and unit-tested** (full suite 1254/1254). The teaching-hour calculation has a single authoritative implementation exposed through three authorization scopes; mentor visibility is class-isolated by construction (the class-id set enters the query, never a UI filter); session-time edits are validated and audited; and the reminder model already enforces creator-vs-assignee field-level permissions at the DB and service layers. What remains is a short list of **explicit business decisions** (overlap counting, midnight-crossing entry, archived-class visibility), not missing security or correctness.

---

## 2. Current Implementation

| Requirement                                                  | Where it lives now                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Mentor edits start/end/entry                              | Service `updateSessionTimes` / `updateStudentJoinTime` — [mentor-session-timings.ts](../../src/lib/services/mentor-session-timings.ts); data `updateSessionActualTimesAsService` — [class-sessions.ts](../../src/lib/data/class-sessions.ts); action `updateSessionTimesAction` — [actions.ts](<../../src/app/(prt)/session-timings/actions.ts>); UI `EditSessionTimes` / `EditJoinTime` on [/session-timings](<../../src/app/(prt)/session-timings/page.tsx>) |
| 2. Session summary (class/tutor/subject)                     | [listMenteeSessionTimings](../../src/lib/services/mentor-session-timings.ts) returns className, subject, tutorId/tutorName; rendered on [/session-timings](<../../src/app/(prt)/session-timings/page.tsx>)                                                                                                                                                                                                                                                     |
| 3. Teaching-hour visibility (mentor per-tutor, class-scoped) | `getClassTutorHours` — [teaching-hours.ts](../../src/lib/services/teaching-hours.ts); panel on [/session-timings](<../../src/app/(prt)/session-timings/page.tsx>)                                                                                                                                                                                                                                                                                              |
| 5. Monthly calc (institute-tz month)                         | `monthWindow` — [month-window.ts](../../src/lib/time/month-window.ts); range read `selectSessionsForClassesInRange` — [analytics.ts](../../src/lib/data/analytics.ts)                                                                                                                                                                                                                                                                                          |
| 7. Reporting UX                                              | Mentor panel (/session-timings); admin report [/admin/teaching-hours](<../../src/app/(prt)/admin/teaching-hours/page.tsx>)                                                                                                                                                                                                                                                                                                                                     |
| 8. Personal / class / org scopes                             | `getTutorPersonalHours` · `getClassTutorHours` · `getAllClassTutorHours` — [teaching-hours.ts](../../src/lib/services/teaching-hours.ts)                                                                                                                                                                                                                                                                                                                       |
| 9–10. Reminder permissions                                   | Service [reminders.ts](../../src/lib/services/reminders.ts) (creator-only edit/delete, either-party mark-done); RLS + guard trigger [0086_assigned_reminders.sql](../../supabase/migrations/0086_assigned_reminders.sql)                                                                                                                                                                                                                                       |
| Auth primitives                                              | `canManageClass`, `canWriteClass`, `mentorAuthorityClassIds` — [permission/class.ts](../../src/lib/permission/class.ts)                                                                                                                                                                                                                                                                                                                                        |

---

## 3. Requirement-by-Requirement Gap Analysis

| Requirement                             | Current State                                                                                                                        | Gap                                       | Risk | Required Change                                                                | Priority |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ---- | ------------------------------------------------------------------------------ | -------- |
| A. Mentor edits start/end               | **Implemented** — `updateSessionTimes`, canManageClass-gated, class-scoped                                                           | None                                      | —    | Done                                                                           | P1       |
| A. Server-side auth (not FE-only)       | **Implemented** — action → service → `canManageClass`; UI is not the boundary                                                        | None                                      | —    | Done                                                                           | P0       |
| A. Cross-class manipulation (IDOR)      | **Blocked** — `canManageClass(actor, classId)` re-checks scope on every write; the classId is authorized, not trusted                | None                                      | —    | Done                                                                           | P0       |
| A. Start/end validation                 | **Implemented** — `assertTimeOrder` (end>start, no end-without-start) + ≤24h cap in both `saveSessionTimes` and `updateSessionTimes` | None                                      | —    | Done                                                                           | P1       |
| A. Audit trail                          | **Partial** — `attendance.session_times` audit records actor/entity/timestamp; **old/new values are NOT captured**                   | No before/after diff                      | Low  | Optional: store prev/new in audit meta                                         | P2       |
| A. Concurrent edits                     | Last-write-wins (upsert on class_id+session_date)                                                                                    | No optimistic lock                        | Low  | Business decision (see §19)                                                    | P3       |
| 2. Tutor column                         | **Implemented** — historical `class_sessions.tutor_id` (attribution at record time)                                                  | None                                      | —    | Done                                                                           | P1       |
| 2. Subject column                       | **Implemented but CURRENT subject** (class-level, not historized)                                                                    | No per-session subject snapshot           | Low  | Business decision — subject is on `classes`, effectively fixed for a 1:1 class | P2       |
| 3. Mentor per-tutor class hours         | **Implemented + isolated** — `getClassTutorHours` scoped to `mentorAuthorityClassIds`                                                | None                                      | —    | Done                                                                           | P0       |
| 5. Monthly [1st, last]                  | **Implemented** — institute-tz half-open `[1st 00:00, next-1st 00:00)`                                                               | None                                      | —    | Done                                                                           | P1       |
| 6. Edge cases                           | **Defined** (see §6)                                                                                                                 | Overlap/midnight = business decisions     | Low  | Decide §19 Q1/Q2/Q9                                                            | P2       |
| 7. Admin report                         | **Implemented** — `/admin/teaching-hours`, class×tutor + totals                                                                      | Extra global/mentor-wise totals not built | —    | Enhancement only                                                               | P2       |
| 8. Three scopes, one calc               | **Implemented** — shared `aggregateClassTutorHours` + `minutesBetween`                                                               | None                                      | —    | Done                                                                           | P1       |
| 9. Student can't edit assigned reminder | **Implemented** — creator-only edit; RLS + trigger                                                                                   | None                                      | —    | Done                                                                           | P0       |
| 9. Student owns own reminders           | **Implemented** — personal reminder creator==owner                                                                                   | None                                      | —    | Done                                                                           | P1       |
| 10. Field-level / action split          | **Implemented** — separate `markReminderSent` (either party) vs `editReminder` (creator)                                             | None                                      | —    | Done                                                                           | P0       |

---

## 4. Permission Matrix

Legend: ✅ allowed · ❌ denied · **(mentor = of the class's mentee; tutor = of the class)** · `class` scope = `canManageClass` / `mentorAuthorityClassIds`.

| Action                             | Student          | Tutor                        | Mentor                       | Sub-Admin            | Super Admin            |
| ---------------------------------- | ---------------- | ---------------------------- | ---------------------------- | -------------------- | ---------------------- |
| View own sessions                  | ✅               | ✅                           | ✅                           | ✅                   | ✅                     |
| View class sessions                | ❌               | ✅ (own class)               | ✅ (mentee class)            | ✅                   | ✅                     |
| Edit student entry time            | ❌               | ✅ (own class)               | ✅ (mentee class)            | ✅                   | ✅                     |
| Edit session start                 | ❌               | ✅ (own class)               | ✅ (mentee class)            | ✅                   | ✅                     |
| Edit session end                   | ❌               | ✅ (own class)               | ✅ (mentee class)            | ✅                   | ✅                     |
| View own teaching hours            | —                | ✅ (`getTutorPersonalHours`) | —                            | ✅                   | ✅                     |
| View class tutor hours             | ❌               | —                            | ✅ (own mentee classes only) | ✅                   | ✅                     |
| View **other** class tutor hours   | ❌               | ❌                           | ❌ (isolated)                | ✅                   | ✅                     |
| View global teaching hours         | ❌               | ❌                           | ❌                           | ✅ (`manageClasses`) | ✅                     |
| Create personal reminder           | ✅               | ✅                           | ✅                           | ✅                   | ✅                     |
| Assign reminder to a student       | ❌               | ✅ (own class)               | ✅ (mentee class)            | ✅                   | ✅                     |
| Edit own reminder                  | ✅               | ✅                           | ✅                           | ✅                   | ✅                     |
| Edit tutor/mentor-created reminder | ❌               | creator only                 | creator only                 | creator only         | creator only           |
| Change reminder deadline/priority  | ❌ (assignee)    | creator only                 | creator only                 | creator only         | creator only           |
| Mark reminder done                 | ✅ (if assignee) | ✅ (either party)            | ✅ (either party)            | ✅                   | ✅                     |
| Delete reminder                    | ❌ (assignee)    | creator only                 | creator only                 | creator only         | creator only           |
| Erase a user (PII)                 | ❌               | ❌                           | ❌                           | ❌                   | ✅ (`manageAdminTier`) |

Marks: session-time edits and class hours were the **required changes** (now done). Reminder rows were an existing concern, now enforced. Global hours gated on `manageClasses` (admin + sub_admin) is a **recommended default**.

---

## 5. Data-Scoping Analysis (the isolation invariant)

The requirement "Mentor X → Class A → Tutor A's Class-A hours only, never Class-B" is enforced **server-side by which class-ids enter the query**, never by a UI filter.

```
getClassTutorHours(mentorX, '2026-08'):
  classIds = mentorAuthorityClassIds(mentorX.id)      // = {Class A}   (mentee-enrolled classes)
  rows     = class_sessions WHERE class_id IN {Class A}
             AND actual_start ∈ [Aug-1 00:00 IST, Sep-1 00:00 IST)
  GROUP BY class_id, tutor_id                          // Tutor A/Class-A bucket only
```

`mentorAuthorityClassIds` derives from the mentor's **student-scoped** mentor personas → their mentees → the classes those mentees are actively enrolled in ([class.ts:24-28](../../src/lib/permission/class.ts)). Tutor A's Class-B sessions never enter `rows`, so no UI filtering is involved and none can be bypassed.

The anti-pattern (`getTutorAnalytics(TutorA)` which sums `myClassIds(TutorA) = {A, B}`) is **not** used for the mentor path — a dedicated test asserts the mentor query receives exactly `['C1']` and never a tutor's other class ([teaching-hours.test.ts](../../tests/unit/services/teaching-hours.test.ts)).

---

## 6. Teaching-Hour Calculation Specification

**Authoritative unit:** `minutesBetween(actual_start, actual_end)` — whole minutes, `Math.max(0, round((end-start)/60000))`, `null` when either is missing ([hours.ts](../../src/lib/attendance/hours.ts)). Summed per (class, tutor) in `aggregateClassTutorHours` ([teaching-hours.ts](../../src/lib/services/teaching-hours.ts)). **One implementation; three scopes differ only in which class-ids they authorize.**

| Edge case                 | Rule                                                                                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing end (or start)    | `minutesBetween` → null → contributes **0**; range read `gte/lt` on `actual_start` also **drops** rows with null start                                                                                                                                    |
| End < start / end = start | **Rejected at write** by `assertTimeOrder` (both `saveSessionTimes` and `updateSessionTimes`); the calc also clamps to 0 as defence-in-depth                                                                                                              |
| Absurd duration (> 24h)   | **Rejected at write**                                                                                                                                                                                                                                     |
| Month attribution         | By the month of **`actual_start`** (institute-tz). So **31 Aug 23:30 → 1 Sep 00:30 counts entirely in August.**                                                                                                                                           |
| Midnight-crossing         | Representable in data (instants), but the mentor time editor derives both instants from the single `session_date`, so an end past midnight would read as end<start and be rejected via the UI — **entry across midnight is a business decision** (§19 Q1) |
| Edited session            | **Dynamically recalculated** — reports read live `class_sessions`; no snapshot to go stale                                                                                                                                                                |
| Cancelled/deleted         | No cancel status exists; hard-delete of sessions is admin-only (0083). All recorded sessions count                                                                                                                                                        |
| Duplicate                 | Prevented — sessions are keyed on `(class_id, session_date)` (upsert), so a date can't duplicate                                                                                                                                                          |
| Overlap                   | Both count fully; overlap is **not** prevented — business decision (§19 Q2)                                                                                                                                                                               |

---

## 7. Reminder Permission Specification

Model ([0086](../../supabase/migrations/0086_assigned_reminders.sql)): `reminders(user_id = assignee, created_by = author, class_id, is_sent, completed_at)`. Personal reminder ⇒ `created_by == user_id`. Assigned reminder ⇒ `created_by ≠ user_id`.

Enforcement is **three-layered**:

1. **RLS** (per-verb policies): `reminders_select` (assignee sees theirs, creator sees ones they made), `reminders_insert`, `reminders_update`, `reminders_delete` (creator only).
2. **`BEFORE UPDATE` trigger** restricts the assignee to flipping `is_sent` false→true only — no edit, no reopen.
3. **Service** ([reminders.ts](../../src/lib/services/reminders.ts)): `editReminder`/`deleteReminder` = `assertReminderCreator`; `markReminderSent` = `assertReminderParty` (either). `assignReminder` requires `canManageClass` + assignee enrolled.

So a student on a tutor/mentor reminder can **only mark it done** — every other field is denied at all three layers. Field-level "mark done ≠ edit" is a real split, not a disabled button.

---

## 8. Security Findings

- **IDOR / BOLA:** none on the audited paths. Every session-time write re-checks `canManageClass(actor, classId)`; every hours read scopes by `mentorAuthorityClassIds`/`myClassIds`; reminders re-check creator/party + class. A crafted `classId`/`sessionId`/`tutorId`/`studentId` is authorized against the actor, never trusted.
- **Mass assignment / unrestricted field update:** the narrow `updateSessionActualTimesAsService` writes **only** `actual_start`/`actual_end` (never tutor/summary/staff-note); reminder update is field-restricted by the trigger. No mass-assign vector.
- **Client-side-only control:** none — every hidden control is backed by a service gate; UI is not the boundary.
- **Cross-class / cross-student leakage:** blocked by the scoping in §5.
- **Privilege escalation:** erasure is `manageAdminTier` (hard, never override-granted); `isClassAdmin` is override-resolved (A-09).

(Broader repo security is tracked in the security-reaudit lineage; this audit's surface is clean.)

## 9. Database Findings

- **Relationships:** `class_tutors` (a class **can** have multiple active tutors — deliberately supported); `class_sessions.tutor_id` = historical attribution (nullable → "Unassigned"); subject lives on `classes` (not per-session); `mentorships` + student-scoped mentor personas; `reminders(user_id, created_by, class_id)`.
- **Constraints added this cycle:** `assignments.attachment_drive_link` / resource link scheme checks (0084), `class_sessions` DELETE admin-only (0083), `mentee_notes.body` length (0087), `profiles.erased_at` (0088).
- **Indexes:** present where the reports read — `mentee_notes(student_id, created_at)`, attachments, subjects, guardians, `reminders(user_id, is_sent)`. The monthly read filters `class_sessions.actual_start` in a range; if session volume grows, an index on `class_sessions(class_id, actual_start)` is the one to add (not yet needed at ~100-user scale).
- **Migration requirement:** 0087 + 0088 delivered as repo migrations **and** as `.sql` files in `C:\Users\Shamil\Documents`; rebuild snapshot regenerated to marker **0088** (freshness + privilege-parity gates pass).

## 10. Performance Findings

- The monthly read is a single ranged, class-filtered query (`selectSessionsForClassesInRange`) + one batched name/subject lookup — **no N+1**. `listMenteeSessionTimings` batches classes/subjects/profiles in one pass each.
- `aggregateClassTutorHours` is O(rows) in memory; fine at current scale. `getAllClassTutorHours` (admin) spans all classes but still one ranged query.
- Pre-existing accepted item: `sumResourceDownloads` and the lifetime session reads are unbounded — a year-two concern, not on the monthly path.

## 11. Date/Time Findings

- Instants stored UTC (`timestamptz`); month boundaries computed in the **institute timezone** via `monthWindow` (handles +05:30, year-rollover, leap Feb; falls back to display zone on a bad tz). A UTC-boundary bug is specifically avoided — a 00:30 IST session on the 1st is filed in the correct local month.
- The one timezone nuance is the editor coupling both times to `session_date` (see §6 midnight row).

## 12. Regression Risks

- **Session-time edits feed teaching hours** (intended) and **student entry feeds attendance join** (unchanged — the entry editor writes only `attendance.join_at`). The narrow updater guarantees summary/tutor/staff-note are untouched.
- **Reminder model change (0086)** widened reminders to assigned; the guard trigger + per-verb RLS prevent an assignee gaining edit rights. Personal-reminder behaviour is backward compatible (`created_by` backfilled to `user_id`).
- **No downstream payroll/invoice coupling** to session times was found; teaching hours are report-only.

## 13. Tests Required — status

All present and green (1254/1254):

- Mentor can/can't edit session in (another) class — `updateSessionTimes` permission + validation tests ([mentor-session-times.test.ts](../../tests/unit/services/mentor-session-times.test.ts)).
- Mentor sees only assigned-class tutor hours; empty-scope short-circuit ([teaching-hours.test.ts](../../tests/unit/services/teaching-hours.test.ts)).
- Monthly window: leap Feb, year rollover, +05:30 local edge, invalid-tz fallback ([month-window.test.ts](../../tests/unit/month-window.test.ts)).
- Missing end → 0; null tutor bucket; grouping ([teaching-hours.test.ts]).
- Session-time validation: end<start, end=start, end-without-start, >24h, valid ([session-times.test.ts](../../tests/unit/services/session-times.test.ts)).
- Nav/route + admin-report existence ([nav-order/nav-routes]).
- Reminder creator-vs-assignee (existing reminders suite).

**Remaining as explicit business decisions (§19):** overlap counting (Q2), midnight-crossing entry (Q1), archived-class visibility (Q7), edit history before/after values (Q — optional), optimistic locking (concurrent edits).

---

## Business decisions — now RESOLVED (implemented 2026-09-02)

| #   | Question                   | Decision as implemented                                                                                                                                                                                                                                                                                  |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Session crossing midnight  | **Supported.** `resolveSessionWindow` ([session-window.ts](../../src/lib/attendance/session-window.ts)) rolls a cross-midnight end to the next day (bounded to a ≤6h overnight span so a same-day typo isn't silently read as a ~day-long session). Month attribution stays the month of `actual_start`. |
| Q2  | Overlapping sessions       | **Prevented.** `assertNoTutorOverlap` ([session-overlap.ts](../../src/lib/services/attendance/session-overlap.ts)) rejects a window that overlaps another of the same tutor's sessions, on both write paths.                                                                                             |
| Q3  | Cancelled sessions         | No cancel status exists; all recorded sessions count (unchanged).                                                                                                                                                                                                                                        |
| Q7  | Archived-class hours       | **Excluded.** All three hour scopes + the session-timings list trim to `selectActiveClassIds` / `selectActiveClassIdsAmong` ([classes.ts](../../src/lib/data/classes.ts)).                                                                                                                               |
| —   | Edit before/after in audit | **Captured.** `audit_log.metadata` jsonb (migration 0089); session-time saves record `{ before, after }` via the extended `auditPrivilegedAction`.                                                                                                                                                       |
| —   | Concurrent session edits   | **Optimistic lock.** The editor echoes the loaded `updated_at`; `updateSessionActualTimesAsService` writes only if it still matches, else a "changed by someone else — reload" error.                                                                                                                    |
| E   | One active tutor per class | **No** — multi-tutor deliberately supported (unchanged).                                                                                                                                                                                                                                                 |
| D   | Assigned reminders         | **Built** (0086).                                                                                                                                                                                                                                                                                        |

All resolved items are unit-tested; migration 0089 delivered as repo migration + `.sql` in `C:\Users\Shamil\Documents`; rebuild snapshot regenerated to marker 0089.
