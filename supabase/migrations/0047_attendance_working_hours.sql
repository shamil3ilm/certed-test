-- 0047_attendance_working_hours.sql
--
-- Attendance & working hours. Adds the session-level timing record
-- (scheduled + actual window, plus the tutor's own join/leave) and per-student
-- join/leave times, from which the app derives tutor working hours, student
-- learning hours, session duration, late-join, early-leave and missed time.
-- Backward-compatible: existing rows get null times (the coarse present/late/
-- absent status keeps working unchanged).

begin;

-- Per-student join/leave for a session.
alter table attendance
  add column if not exists join_at timestamptz,
  add column if not exists leave_at timestamptz;

-- One row per class session: the scheduled and actual window and the tutor's own
-- attendance. General by design (per-session, many students) so it also serves
-- future group classes; today a class has a single student.
create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  session_date date not null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  tutor_id uuid references profiles(id) on delete set null,
  tutor_join_at timestamptz,
  tutor_leave_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, session_date)
);
create index if not exists class_sessions_class_idx on class_sessions (class_id, session_date desc);

-- Same visibility as attendance: admin + tutor/mentor of the class (teaches_class,
-- which already includes a mentor of an enrolled student, per 0043) write; enrolled
-- students read their own class's session timings.
alter table class_sessions enable row level security;
create policy class_sessions_read on class_sessions for select
  using (is_active_admin() or teaches_class(class_id) or is_enrolled(class_id));
create policy class_sessions_write on class_sessions for all
  using (is_active_admin() or teaches_class(class_id))
  with check (is_active_admin() or teaches_class(class_id));

commit;
