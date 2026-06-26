-- Phase 5: timetable_slots + calendar_events (spec §5, §5.1 RLS, §7.6, §8 timezone).
-- Depends on 0001 (profiles, is_active_admin, current_status, current_app_role) and
-- 0002 (courses, enrollments, course_teachers, is_enrolled, teaches_course).

create type calendar_event_kind as enum ('event', 'holiday', 'cancellation', 'reschedule');

-- Recurring weekly schedule. Times are WALL-CLOCK in the institute anchor timezone
-- (org_settings.timezone); each occurrence is expanded to an absolute instant before display.
create table timetable_slots (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  subject text not null,
  teacher_id uuid references profiles(id),
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0=Sun .. 6=Sat
  start_time time not null,                          -- wall-clock in org_settings.timezone
  end_time time not null,                            -- wall-clock in org_settings.timezone
  mode_or_location text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint timetable_slots_time_order check (end_time > start_time)
);
create index timetable_slots_course_idx on timetable_slots (course_id);
create index timetable_slots_active_idx on timetable_slots (active);

-- One-off events / holidays / cancellations / reschedules; optional course (null = global).
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date not null,
  start_time time,                                   -- optional wall-clock (org_settings.timezone)
  end_time time,                                      -- optional wall-clock (org_settings.timezone)
  course_id uuid references courses(id) on delete cascade,  -- null = global
  kind calendar_event_kind not null default 'event',
  slot_id uuid references timetable_slots(id) on delete set null,  -- for slot overrides
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index calendar_events_course_idx on calendar_events (course_id);
create index calendar_events_date_idx on calendar_events (event_date);

alter table timetable_slots enable row level security;
alter table calendar_events enable row level security;

-- ── timetable_slots policies ─────────────────────────────────────────
-- Read: enrolled student of the course, teacher-of-course, or admin.
create policy timetable_slots_read on timetable_slots for select
  using (
    is_active_admin()
    or teaches_course(course_id)
    or is_enrolled(course_id)
  );
-- Write (insert/update/delete): teacher-of-course or admin.
create policy timetable_slots_write on timetable_slots for all
  using (is_active_admin() or teaches_course(course_id))
  with check (is_active_admin() or teaches_course(course_id));

-- ── calendar_events policies ─────────────────────────────────────────
-- Read: global events (course_id null) are visible to every active user; course events
-- are visible to enrolled student / teacher-of-course / admin.
create policy calendar_events_read on calendar_events for select
  using (
    is_active_admin()
    or (course_id is null and current_status() = 'active')
    or teaches_course(course_id)
    or is_enrolled(course_id)
  );
-- Write: admin can write any event (incl. global); a teacher may write only events for a
-- course they teach (cannot create global events — those are admin-only).
create policy calendar_events_write on calendar_events for all
  using (
    is_active_admin()
    or (course_id is not null and teaches_course(course_id))
  )
  with check (
    is_active_admin()
    or (course_id is not null and teaches_course(course_id))
  );
