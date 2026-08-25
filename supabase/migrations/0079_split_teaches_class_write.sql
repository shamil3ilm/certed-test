-- 0079_split_teaches_class_write.sql
--
-- Close A-07: mentor write authority leaked at the RLS layer.
--
-- 0043 widened teaches_class() to "tutor of the class OR mentor of an enrolled
-- student", so a mentor gained tutor-level READ of a mentee's class (the intended
-- oversight). But EVERY class-scoped WRITE policy also keys off teaches_class(), so
-- the mentor branch silently granted WRITE too: a profile holding only a
-- student-scoped mentor persona could insert assignments, announcements, resources,
-- meet links, calendar events and timetable slots into the mentee's class - through
-- RLS, as the authenticated role. The application layer refuses this (canManageClass
-- for reads; the narrow manageAttendance capability added in 4ab16dd scopes mentor
-- writes to attendance only), but the database did not enforce it.
--
-- Fix: add teaches_class_write() = TUTOR-ONLY (the tutor branch of teaches_class
-- WITHOUT the mentor branch) and repoint the content/calendar WRITE policies at it.
-- READ policies keep teaches_class() (mentors retain oversight read). attendance_write
-- and class_sessions_write are LEFT on teaches_class() on purpose - editing attendance
-- and session times is exactly the mentor write authority manageAttendance declares.
--
-- The FOR ALL write policies (meet_links_write, calendar_events_write,
-- timetable_slots_write) share their table with a separate *_read policy that still
-- allows a mentor; permissive policies are OR'd for SELECT, so mentor read survives.
--
-- Depends on 0043 (teaches_class / mentors_class), 0003 (content), 0004 (calendar).

begin;

-- Tutor-only class authority, for WRITE policies. Identical to the tutor branch of
-- teaches_class (0043) but WITHOUT `or mentors_class(...)`: a mentor is oversight,
-- not teaching staff, so may not author class content.
create or replace function teaches_class_write(p_class_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1
    from class_tutors ct
    join profiles p on p.id = ct.tutor_id
    join persona_assignments pa
      on pa.profile_id = ct.tutor_id
     and pa.persona_name = 'tutor'::persona_name
     and pa.scope_type = 'global'::persona_scope_type
     and pa.status = 'active'
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and ct.class_id = p_class_id
      and ct.active
  )
$$;

-- 0034 revoked EXECUTE from PUBLIC + set default privileges, so grant explicitly.
grant execute on function teaches_class_write(uuid) to authenticated;

-- ── Announcements: write = tutor/admin only ──────────────────────────────────
drop policy if exists announcements_insert on announcements;
create policy announcements_insert on announcements for insert with check (
  is_active_admin() or (class_id is not null and teaches_class_write(class_id))
);
drop policy if exists announcements_update on announcements;
create policy announcements_update on announcements for update using (
  is_active_admin() or (class_id is not null and teaches_class_write(class_id))
) with check (
  is_active_admin() or (class_id is not null and teaches_class_write(class_id))
);

-- ── Resources: write = tutor/admin only ──────────────────────────────────────
drop policy if exists resources_insert on resources;
create policy resources_insert on resources for insert with check (
  is_active_admin() or teaches_class_write(class_id)
);
drop policy if exists resources_update on resources;
create policy resources_update on resources for update using (
  is_active_admin() or teaches_class_write(class_id)
) with check (
  is_active_admin() or teaches_class_write(class_id)
);

-- ── Assignments: write = tutor/admin only ────────────────────────────────────
drop policy if exists assignments_insert on assignments;
create policy assignments_insert on assignments for insert with check (
  is_active_admin() or teaches_class_write(class_id)
);
drop policy if exists assignments_update on assignments;
create policy assignments_update on assignments for update using (
  is_active_admin() or teaches_class_write(class_id)
) with check (
  is_active_admin() or teaches_class_write(class_id)
);

-- ── Meet links: write = tutor/admin only (meet_links_read keeps mentor read) ──
drop policy if exists meet_links_write on meet_links;
create policy meet_links_write on meet_links for all using (
  is_active_admin() or (class_id is not null and teaches_class_write(class_id))
) with check (
  is_active_admin() or (class_id is not null and teaches_class_write(class_id))
);

-- ── Calendar events: write = tutor/admin only (calendar_events_read keeps read) ─
drop policy if exists calendar_events_write on calendar_events;
create policy calendar_events_write on calendar_events for all using (
  is_active_admin() or (class_id is not null and teaches_class_write(class_id))
) with check (
  is_active_admin() or (class_id is not null and teaches_class_write(class_id))
);

-- ── Timetable slots: write = tutor/admin only (timetable_slots_read keeps read) ─
drop policy if exists timetable_slots_write on timetable_slots;
create policy timetable_slots_write on timetable_slots for all using (
  is_active_admin() or teaches_class_write(class_id)
) with check (
  is_active_admin() or teaches_class_write(class_id)
);

commit;
