# RLS policy inventory

A high-level verification guide to the intended public-schema RLS surface — the policy families to check, not a line-by-line generated catalog. The source of truth is the live migrations in `supabase/migrations`.

Use this file for:

- policy family verification
- table-level access expectations
- post-migration review guidance

Do not use this file as the sole source for:

- exact `create policy` statements
- exhaustive policy SQL bodies
- helper-function implementation details

For those, use the migrations directly.

## Current migration range

The chain starts at `0001`; the current end is the highest-numbered file in `supabase/migrations/`.

Read the directory rather than trusting a hard-coded end number in prose.

## Verification query

Run:

```sql
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Current policy families to verify

This is the current functional inventory. It is intentionally grouped by purpose rather than frozen to an outdated count from older phases.

### Identity and authorization tables

- `profiles`
  - self-read
  - self-update
  - admin write

- `persona_assignments`
  - self-read
  - admin read-all
  - admin insert
  - admin update
  - admin delete

- `capability_overrides`
  - self-read
  - admin read-all
  - admin insert
  - admin update
  - admin delete

- `guardians`
  - read (`guardians_read`)
  - no write policy — service-role only, behind `manageUsers`

- `consents`
  - read (`consents_read`)
  - no write policy — service-role only (written on acceptance)

### Organization and admin-only records

- `org_settings`
  - read
  - admin write

- `audit_log`
  - admin read
  - admin insert

### Academic relationship tables

- `classes`
  - read
  - admin write

- `enrollments`
  - read
  - admin write

- `class_tutors`
  - read
  - admin write

- `class_sessions`
  - read — admin and the class's teaching staff see every session; a STUDENT sees only the
    sessions they were marked for. Keyed on `attendance.session_id`, not
    `(class_id, session_date)`: a class may hold several sessions a day (0093), so the date
    key let a student who attended the morning read the afternoon too (0085 → fixed in 0097)
  - write (class tutor / admin)
  - student feedback update — a student may write `student_feedback`, and only on a session
    they were marked for. Column access is separately restricted to that one column (0068),
    so it cannot reach a summary or a staff note
  - the student INSERT path was withdrawn in 0097: since 0094 a mark cannot exist without
    its session, so a student never needs to create one

- `mentorships`
  - read
  - admin write

- `subjects`
  - read (`subjects_read`)
  - no write policy — service-role only, behind an admin gate

- `mentee_notes`
  - read (`mentee_notes_read`) — `is_active_admin()`, or the student's mentor scoped to
    their own tenure. Deliberately **not** widened to `sub_admin` by 0092 (which did widen
    the class-scoped `teaches_class()`), so a sub-admin sees no pastoral history. The
    service-role reader in `src/lib/services/mentee-notes.ts` mirrors this on purpose —
    widening it there without a migration would make the app looser than the policy.
  - no write policy — service-role only, behind `canMentor`

### Content tables

- `announcements`
  - read
  - insert
  - update

- `resources`
  - read
  - insert
  - update

- `assignments`
  - read
  - insert
  - update

- `submissions`
  - read
  - insert
  - update

- `comments`
  - read
  - insert
  - delete (author / authority)

- `resource_versions`
  - read (mirrors the parent resource's read)

- `attachments`
  - read (owner submission / resource / announcement read); writes are service-role only

- `tags`
  - read (shared vocabulary); admin / service-role writes

- `meet_links`
  - read
  - write

### Calendar and attendance

- `timetable_slots`
  - read
  - write

- `calendar_events`
  - read
  - write

- `attendance`
  - read
  - write
  - a mark belongs to a SESSION since 0094 (`session_id` NOT NULL, unique with
    `student_id`). The policies still gate on `class_id` / `student_id` and were not
    changed by that migration — but anything scoping to "the session a student attended"
    must join on `session_id`, never on `(class_id, session_date)`

### Finance

- `receipts`
  - read
  - admin write

- `receipt_lines`
  - read
  - admin write

- `payslips`
  - read
  - admin write

- `payslip_lines`
  - read
  - admin write

- `exchange_rates`
  - admin-all (rate management); conversion reads go through the service-role client

- `document_counters`
  - admin only (atomic finance numbering)

- `billing_rates`
  - admin tier only, read AND write (0095). Not the sub-admin tier: 0092 widened that
    persona over CLASS-scoped tables and deliberately left the finance ledger to admins
  - nobody reads their own rate — not the student it prices, not the tutor it pays. There is
    no per-row owner column to fall back on, so RLS is the ONLY thing holding this closed,
    which is why the table is in the queue-health RLS monitor

### Self-scoped workflow data

- `reminders`
  - split per verb (0086), not a single "self all". A PERSONAL reminder
    (`created_by = user_id`) keeps full owner control. An ASSIGNED one
    (`created_by <> user_id`) is read + mark-done-only for the assignee and fully managed by
    its creator; a BEFORE UPDATE trigger restricts the assignee to flipping `is_sent`
    false → true, which RLS alone cannot express

- `notifications`
  - self read
  - restricted self update for read-state behavior

### Messaging

- `conversations`
  - participant read
  - controlled insert

- `conversation_participants`
  - participant read
  - no self-UPDATE policy; `last_read_at` (mark-read) is written server-side, not via RLS

- `messages`
  - participant read
  - participant insert

### Service-role only (RLS enabled, no public policy)

RLS is on with no SELECT/INSERT policy, so these are reachable only through the service-role client (RLS bypass) — by design.

- `entity_tags` — tag joins, written by the tagging service
- `pending_emails` — the outbound email queue (enqueued and drained server-side)
- `rate_limit_counters` — IP-keyed rate-limit counters

## What to check

1. expected tables have policies
2. no stale duplicate policies remain from replaced migrations
3. admin helper policy rewrites match the current authority model
4. notifications policies reflect the current read-state and content-hardening model
5. messaging policies reflect the current messaging schema
6. FUNCTION EXECUTE grants, not just table policies. Supabase grants EXECUTE on a new
   function in `public` to `anon` and `authenticated` as NAMED roles, and
   `REVOKE ... FROM PUBLIC` does not remove a named-role grant. A re-signed function is a
   NEW object, so it arrives open: re-signing `issue_receipt_doc` in 0095 handed a
   SECURITY DEFINER document-minting function to the publishable key until the fail-closed
   sweep in 0096. Check the sweep and the default privilege, not only the policies

## Required follow-up on schema changes

Whenever a migration changes:

- policy names
- helper-function authority
- a new RLS table
- self-update restrictions
- the KEY a policy joins on (re-keying `class_sessions` from the date to the session
  changed who could read what without changing a single policy name)
- function EXECUTE grants or default privileges in `public`

this file must be updated in the same workstream.

If a future workflow needs an exact generated policy register, add that as a separate artifact instead of turning this verification guide into a raw dump.
