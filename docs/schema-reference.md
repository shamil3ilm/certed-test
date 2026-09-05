# Schema reference

A high-level, table-by-table summary of the active schema and helper-function model (40 tables) — not a generated full-column dump. The source of truth is the migrations in `supabase/migrations`.

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

The active migration chain starts at `0001` and ends at the highest-numbered file in `supabase/migrations/`.

Read the directory rather than trusting a hard-coded end number in prose.

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

### `guardians`

Purpose:

- guardian/parent contact records for a student (`student_id` → `profiles`)

Notes:

- columns: `name`, `phone`, `email`, `relationship`, `is_primary`
- third-party PII: these are contact details of someone who is **not** a platform user, so
  erasing a student must delete these rows explicitly — the `profiles` row is retained for
  audit/finance FKs, so an `ON DELETE CASCADE` never fires
- RLS: `guardians_read` (SELECT only); writes go through the service role behind a
  `manageUsers` gate

### `consents`

Purpose:

- a profile's acceptance of the current policy versions (`profile_id` → `profiles`)

Notes:

- columns: `terms_version`, `privacy_version`, `guardian_consent`, `cross_border_consent`,
  `jurisdiction`, `accepted_at`
- one row per acceptance, so the history of which version a user accepted is preserved
- RLS: `consents_read` (SELECT only)

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

### `class_sessions`

Purpose:

- individual held/scheduled sessions of a class (attendance and session feedback anchor to these)

### `mentorships`

Purpose:

- mentor-to-student relationship

Notes:

- `mentor_id` is the supervising party
- mentors may be dedicated mentors or tutors who also mentor
- revoking a mentor disables these links in the current workflow
- restoring a revoked mentor does not automatically reactivate prior links in the current workflow

### `subjects`

Purpose:

- the subject master list a class is taught against (`classes.subject_id` → `subjects`)

Notes:

- columns: `name`, `active`, `created_by`
- `active` soft-retires a subject without breaking classes that reference it
- RLS: `subjects_read` (SELECT only); writes are service-role behind an admin gate

### `mentee_notes`

Purpose:

- a mentor's private pastoral notes about a mentee (`student_id`, `author_id` → `profiles`)

Notes:

- `body` is CHECK-constrained to 1–2000 characters
- deliberately minimal: no title, no category — the smallest shape that serves the purpose
- RLS: `mentee_notes_read` (SELECT only), scoped so a mentor sees only notes from **their
  own tenure** with that student; writes are service-role behind a `canMentor` gate
- erasing a student deletes these rows explicitly

## Content and learning records

### `announcements`

- class-scoped or academy-wide stream posts

### `resources`

- class materials and resource links

### `resource_versions`

- version history for a resource (each edit keeps the prior file/link)

### `assignments`

- classwork definition

### `submissions`

- student assignment submissions
- includes grading fields
- includes `is_active` for versioning / replacement semantics

### `comments`

- contextual discussion; the `entity_type` set (canonical here) is:
  - submissions
  - resources
  - meet links
  - announcements

### `attendance`

- per-class, per-student, per-session attendance records

### `attachments`

- custodial file records uploaded to academy-owned Drive storage, for submissions, resources, and announcements
- explicit lifecycle `pending` → `active` / `failed` / `deleted`; exactly one owner (see [ADR-0006](adr/0006-custodial-attachment-storage.md))

### `meet_links`

- per-class meeting links

### `tags`

- the shared tag vocabulary

### `entity_tags`

- tag assignments joining a tag to a tagged row (submission, resource, etc.)

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

### `exchange_rates`

- admin-managed, effective-dated currency conversion rates (multi-currency finance, migration 0056)

## Workflow and operational tables

### `reminders`

- self-scoped reminder records

### `audit_log`

- privileged action tracking

### `timetable_slots`

- recurring timetable structure
- `timezone` (nullable) anchors each slot's wall-clock to its own IANA zone; `NULL` falls back to `org_settings.timezone`

### `calendar_events`

- dated event records

### `pending_emails`

- outbound email queue drained by a scheduled job, so notification email fan-out stays off the request path

### `rate_limit_counters`

- Postgres-backed counters for IP-keyed rate limiting of unauthenticated endpoints

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

## Foreign keys and cascade behaviour

Referential integrity is enforced by foreign keys throughout; the `ON DELETE` behaviour of each follows one consistent policy:

- **CASCADE** for rows that are meaningless without their parent — a class's academic records, a submission's comments and attachments, a person's own participation (enrollments, personas, notifications, reminders).
- **SET NULL** for authorship/actor references and financial party links, so a deleted person never erases the receipts, payslips or audit trail they touched.
- **RESTRICT** for `attachments.uploaded_by`, so a profile that still owns custodial files cannot be deleted out from under them.

Two columns (`calendar_events.created_by`, `timetable_slots.tutor_id`) currently default to NO ACTION — see the review note in the inventory.

For the exhaustive per-column table and rationale (the FK count lives there), use:

- [fk-cascade-inventory.md](./fk-cascade-inventory.md)

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

## Related

- [persona-model.md](./persona-model.md)
- [rls-policy-inventory.md](./rls-policy-inventory.md)
- [fk-cascade-inventory.md](./fk-cascade-inventory.md)
- [workflow-invariants.md](./workflow-invariants.md)
