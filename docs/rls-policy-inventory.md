# RLS Policy Inventory

- Status: Verification reference
- Scope: High-level policy inventory, not a line-by-line generated catalog
- Source of truth: live migrations in `supabase/migrations`

This document is a verification guide for the intended public-schema RLS surface.

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

The current chain runs from:

- `0001`
- through `0029`

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

- `mentorships`
  - read
  - admin write

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

- `receipt_lines`
  - read

- `payslips`
  - read

- `payslip_lines`
  - read

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
  - self read-state update behavior as implemented

- `messages`
  - participant read
  - participant insert

## What to check

1. expected tables have policies
2. no stale duplicate policies remain from replaced migrations
3. admin helper policy rewrites match the post-`0022` and post-`0026` authority model
4. notifications policies reflect the read-only content hardening from `0029`
5. messaging policies reflect the current messaging schema

## Required follow-up on schema changes

Whenever a migration changes:

- policy names
- helper-function authority
- a new RLS table
- self-update restrictions

this file must be updated in the same workstream.

If a future workflow needs an exact generated policy register, add that as a separate artifact instead of turning this verification guide into a raw dump.
