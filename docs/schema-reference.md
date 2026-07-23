# Schema Reference

- Status: Current reference
- Scope: High-level current-state summary, not a generated full-column dump
- Source of truth: `supabase/migrations`

This document summarizes the active schema and helper-function model at a practical level.

Use this file for:

- table purpose
- major schema concepts
- important helper-function relationships
- current architectural understanding of the database

Do not use this file as the sole source for:

- exact DDL
- exact indexes
- exact constraints
- exact policy SQL

For those, use the migration chain directly.

## Current migration range

The active migration chain runs from:

- `0001`
- through `0029`

## Core identity model

### `profiles`

Purpose:

- fixed account identity
- sign-in binding target
- lifecycle state

Key concepts:

- `role` is the fixed account identity
- `status` is the lifecycle state
- `auth_user_id` binds the profile to the auth identity

Current role values:

- `admin`
- `sub_admin`
- `tutor`
- `mentor`
- `student`

Current status values:

- `active`
- `pending`
- `disabled`

### `persona_assignments`

Purpose:

- authorization model
- global and scoped personas

Used for:

- capability resolution
- future persona expansion
- scoped access such as mentor relationships

Operational notes:

- global persona rows are synchronized to fixed identity on create and restore
- scoped persona rows are also used for relationship-based access such as mentor-to-student visibility
- revocation inactivates all scopes, not only global rows

### `capability_overrides`

Purpose:

- explicit per-profile allow and deny overrides over the persona baseline

Operational notes:

- current live use is global override scope
- hard capabilities are not override-grantable
- admin-facing capability tooling currently reflects global capability state, not every scoped access path

## Academic structure

### `classes`

Purpose:

- class lifecycle and class identity

### `enrollments`

Purpose:

- student-to-class relationship

### `class_tutors`

Purpose:

- tutor-to-class relationship

### `mentorships`

Purpose:

- mentor-to-student relationship

Notes:

- `mentor_id` is the supervising party
- mentors may be dedicated mentors or tutors who also mentor
- revoking a mentor disables these links in the current workflow
- restoring a revoked mentor does not automatically reactivate prior links in the current workflow

## Content and learning records

### `announcements`

- class-scoped or academy-wide stream posts

### `resources`

- class materials and resource links

### `assignments`

- classwork definition

### `submissions`

- student assignment submissions
- includes grading fields
- includes `is_active` for versioning / replacement semantics

### `comments`

- contextual discussion attached to:
  - submissions
  - resources
  - meet links

### `attendance`

- per-class, per-student, per-session attendance records

## Messaging and notifications

### `conversations`

Purpose:

- direct and group conversation containers

Current model includes:

- `kind`
- `title`
- `last_message_at`
- `last_message_body`
- `last_message_sender_id`
- `direct_key`

### `conversation_participants`

Purpose:

- conversation membership
- unread watermark through `last_read_at`

### `messages`

Purpose:

- immutable thread messages

### `notifications`

Purpose:

- in-app notification feed
- self-readable notification records
- read-state updates only for end users

## Finance and organization

### `org_settings`

- organization-wide display and finance settings

### `receipts`

- student-side finance documents

### `receipt_lines`

- receipt line items

### `payslips`

- tutor and mentor payout documents

### `payslip_lines`

- payslip line items

### `document_counters`

- atomic numbering support for finance documents

## Workflow and operational tables

### `reminders`

- self-scoped reminder records

### `audit_log`

- privileged action tracking

### `timetable_slots`

- recurring timetable structure

### `calendar_events`

- dated event records

## Helper-function model

The application relies on helper functions to keep app auth and RLS aligned.

Important families:

- current actor helpers
- self-active helpers
- class-scope helpers
- persona helpers
- admin authority helpers

Examples of important helpers:

- `current_profile_id()`
- `is_self_active(...)`
- `is_enrolled(...)`
- `teaches_class(...)`
- `mentors_student(...)`
- `user_has_persona(...)`
- `user_is_admin(...)`
- `is_active_admin()`

Important current rule:

- `is_active_admin()` is part of the unified admin authority model and must stay aligned with `user_is_admin(...)`

## RLS model summary

The database trust boundary is RLS.

The broad access patterns are:

1. self-scoped read and limited self-update
2. class-scope access for tutors and enrolled students
3. relationship-scope access for mentors
4. admin-wide access where intended

For exact policy names and verification expectations, use:

- [rls-policy-inventory.md](./rls-policy-inventory.md)

## Important notes for future changes

1. Use the migration chain as truth, not older phase notes.
2. Keep schema changes and policy changes explicit and reviewable.
3. Update this document whenever:
   - a new table is added
   - helper-function authority changes
   - persona or capability support changes
   - a new user-facing domain is introduced
4. If a fully exhaustive table or function snapshot is needed later, add it as a separate generated or maintenance-heavy document rather than overloading this summary.

## Related docs

- [persona-model.md](./persona-model.md)
- [rls-policy-inventory.md](./rls-policy-inventory.md)
- [workflow-invariants.md](./workflow-invariants.md)
