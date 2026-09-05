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
  - read
  - write (class tutor / admin)

- `mentorships`
  - read
  - admin write

- `subjects`
  - read (`subjects_read`)
  - no write policy — service-role only, behind an admin gate

- `mentee_notes`
  - read (`mentee_notes_read`) — scoped to the mentor's own tenure with that student
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

### Self-scoped workflow data

- `reminders`
  - self all

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

## Required follow-up on schema changes

Whenever a migration changes:

- policy names
- helper-function authority
- a new RLS table
- self-update restrictions

this file must be updated in the same workstream.

If a future workflow needs an exact generated policy register, add that as a separate artifact instead of turning this verification guide into a raw dump.
