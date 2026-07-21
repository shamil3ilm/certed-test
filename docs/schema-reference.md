# Schema Reference

**Purpose:** Document the active schema (tables, columns, RLS helpers) as built by
migrations `0001`–`0021` and the canonical `supabase/rebuild/0000_full_rebuild.sql`.
**Status:** Authoritative — source of truth for schema-aware work.

See [rls-policy-inventory.md](./rls-policy-inventory.md) for the expected end-state
RLS policies and [persona-model.md](./persona-model.md) for the persona design.

---

## Tables

### Core
- `profiles` (id, auth_user_id, email, full_name, role, status, class_level, created_at)
  - Columns: NO access_state
  - Status enum: active | pending | disabled
  - Role enum: admin | sub_admin | tutor | mentor | student
    (mentor is an independent identity — a mentor may or may not also be a tutor)

- `org_settings` (id, institute_name, contact_email, contact_phone, bank_account, bank_ifsc, bank_branch, terms_text, signatory_name, signatory_title, signature_mode, signature_text, default_currency, timezone, receipt_prefix, payslip_prefix)

### Classes & Membership
- `classes` (id, name, status, created_at)
  - Columns: id, name, status (active|archived), created_at
  - NO class_id or mentor_id field

- `enrollments` (id, student_id, class_id, active, created_at)
  - Soft-deletable via active boolean
  - Columns: student_id, class_id, active (NOT disabled/pending)
  - Unique constraint: (student_id, class_id)

- `class_tutors` (id, tutor_id, class_id, active, created_at)
  - Soft-deletable via active boolean
  - Columns: tutor_id, class_id, active
  - Unique constraint: (tutor_id, class_id)

- `mentorships` (id, mentor_id, student_id, active, created_at)
  - Soft-deletable via active boolean
  - `mentor_id` is the supervising party (renamed from tutor_id in 0021 — a mentor
    may be a dedicated mentor account or a tutor who also mentors)
  - Columns: mentor_id, student_id, active (NOT class_id)
  - Unique constraint: (mentor_id, student_id)

### Content
- `assignments` (id, class_id, title, description, due_date, attachment_drive_link, created_by, status, created_at)
- `submissions` (id, assignment_id, student_id, drive_link, file_name, status, submitted_at, is_active, created_at)
  - Columns: assignment_id, student_id (NOT class_id)
  - Grading info: score, feedback, graded_at, graded_by (added in 0008)

- `resources` (id, class_id, title, drive_link, uploaded_by, status, created_at)

- `announcements` (id, class_id, title, message, author_id, status, created_at)
  - class_id is nullable (global announcements)

- `comments` (id, entity_type, entity_id, author_id, body, created_at)
  - Polymorphic: entity_type in (submission | resource | meet)

- `meet_links` (id, class_id, title, meet_url, hosted_by, created_at)
  - class_id is nullable (global meets)

### Finance
- `receipts` (id, number, student_id, student_name_snapshot, class_snapshot, issue_date, currency, note, subtotal, discount, total, voided, created_by, created_at)

- `receipt_lines` (id, receipt_id, subject, hours, rate, amount)

- `payslips` (id, number, tutor_id, tutor_name_snapshot, issue_date, currency, note, subtotal, discount, total, voided, created_by, created_at)

- `payslip_lines` (id, payslip_id, subject, hours, rate, amount)

### Workflow
- `reminders` (id, user_id, title, note, is_done, created_at, updated_at)

- `attendance` (id, class_id, student_id, session_date, status, marked_by, created_at, updated_at)
  - status check: present | absent | late

- `audit_log` (id, actor_id, action, entity_type, entity_id, created_at)

- `setup_codes` (code, created_at) - [version table for feature flags, not schema]

- `topics` - [ALTER to assignments/resources in 0008]

### Messaging (0018)
- `conversations` (id, kind, title, created_by, last_message_at, created_at)
  - `kind` enum: direct | group; `title` is null for direct (auto-titled from participants)
- `conversation_participants` (id, conversation_id, profile_id, last_read_at, joined_at)
  - Unique constraint: (conversation_id, profile_id); unread = messages newer than `last_read_at`
- `messages` (id, conversation_id, sender_id, body, created_at)
  - `sender_id` nullable (set null on sender delete); cascades on conversation delete

---

## Helper Functions

### Authentication Helpers
- `current_app_role()` -> user_role
  - Returns: role from profiles where auth_user_id = auth.uid()

- `current_status()` -> user_status
  - Returns: status from profiles where auth_user_id = auth.uid()

- `is_active_admin()` -> boolean
  - Returns: exists profile where role='admin' AND status='active' AND auth_user_id=auth.uid()

### Scope Helpers (Require Active + Link Active)
- `is_enrolled(p_class_id uuid)` -> boolean
  - Checks: enrollment exists AND profile.status='active' AND enrollment.active=true

- `teaches_class(p_class_id uuid)` -> boolean
  - Checks: class_tutors link exists AND profile.status='active' AND class_tutors.active=true

- `mentors_student(p_student_id uuid)` -> boolean
  - Checks: mentorship link exists AND profile.status='active' AND mentorship.active=true

### Self-Access Helper (0011 Hardening)
- `is_self_active(p_id uuid)` -> boolean
  - Checks: profile.id=p_id AND auth_user_id=auth.uid() AND status='active'
  - Purpose: Gate self-read on disabled users

---

## Existing RLS Patterns (0001-0016)

### Pattern 1: Admin Override + Role-Based Access
```sql
create policy TABLE_read on TABLE for select using (
  is_active_admin()
  or (role-based check)
  or (self-read with is_self_active)
);
```

### Pattern 2: Status Check via Helper
```sql
-- Use is_enrolled(), teaches_class(), mentors_student()
-- These already check status='active' internally
or is_enrolled(class_id)
or teaches_class(class_id)
or mentors_student(student_id)
```

### Pattern 3: Self-Read with Active Hardening
```sql
-- Use is_self_active() for disabled-user protection
or is_self_active(student_id)
```

### Pattern 4: Via Join (Fallback for Computed Reads)
```sql
or exists (
  select 1 from profiles p
  where p.id = child_table.user_id
    and p.auth_user_id = auth.uid()
    and p.status = 'active'
)
```

---

## Persona model (0014-0017)

The persona model was added on top of the base schema:
- `0014` — `persona_assignments` table, `persona_name` / `persona_scope_type` enums
- `0015` — populate personas from `profiles.role` and `mentorships`
- `0016` — persona helper functions (`user_has_persona`, `user_is_admin`, `user_is_mentor_for_student`)
- `0017` — persona-era RLS hardening (disabled-user, settings, and finance)

See [persona-model.md](./persona-model.md) for the design and rationale.

## Constraints for future migrations

1. Use only helpers that exist in the current chain (`is_self_active`, `is_active_admin`,
   `teaches_class`, `mentors_student`, `user_has_persona`, …).
2. Reference only columns/tables that actually exist.
3. Match actual policy names from base migrations when replacing policies.
4. Use ASCII-only comments.
5. Keep RLS policy changes and schema (table/column) changes in separate migrations.

