-- Migration 0024: in-app notifications, with content immutable from the client.
--
-- Consolidates the drafted 0027 and 0029, neither of which had been applied. 0029
-- existed only to correct 0027's write grant in the same breath it was introduced,
-- so shipping them separately would add a table and then immediately narrow it.
-- The grant here is the corrected one from the start.

--
-- A per-user notification feed, written server-side (service role) when something
-- relevant happens - a new message, a grade, a class announcement - and read by the
-- owner. Closes the "no notifications anywhere" Classroom-parity gap.
--
-- RLS: a user reads and marks-read only their OWN rows, and only while active
--      (is_self_active, matching every other self-scoped table). Inserts are done
--      by trusted server code via the service role, so there is no insert policy.
--
-- Idempotent. Depends on: 0001 (profiles, is_self_active).

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null,                 -- 'message' | 'grade' | 'announcement'
  title text not null,
  body text,
  link text,                          -- in-app path to the source, e.g. /messages/<id>
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_idx on notifications(profile_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications for select
  using (is_self_active(profile_id));

drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update
  using (is_self_active(profile_id))
  with check (is_self_active(profile_id));

-- ---------------------------------------------------------------------------

--
-- Why: 0027's notifications_update policy scopes the ROW (is_self_active(profile_id)),
--      but an RLS policy cannot restrict COLUMNS. A user could therefore rewrite kind,
--      title, body or link on their own notifications, so the feed would stop being an
--      authoritative record of what actually happened (e.g. re-pointing a link, or
--      relabelling a grade notice).
--
-- Fix: column privileges, which are the right tool for this - revoke blanket UPDATE and
--      grant UPDATE only on read_at. The row policy still applies on top, so a user can
--      flip the read state of their OWN rows and nothing else. SELECT is untouched, and
--      INSERT stays service-role only (no insert policy/grant), so notification content
--      is written solely by trusted server code.
--
-- Idempotent (revoke/grant are declarative). Depends on: 0027 (notifications).

revoke update on table notifications from anon, authenticated;
grant update (read_at) on table notifications to authenticated;
