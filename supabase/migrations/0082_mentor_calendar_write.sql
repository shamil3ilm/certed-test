-- 0082_mentor_calendar_write.sql
--
-- Let a MENTOR coordinate mentoring by managing the calendar (one-off events + timetable
-- slots) for a class their mentee is enrolled in - but NON-DESTRUCTIVELY and attributably.
--
-- 0079 (A-07) narrowed every class-scoped write to tutor-only (teaches_class_write) to close
-- the mentor-write leak on CONTENT. Calendar is not content, so a mentor regains INSERT/UPDATE
-- here (teaches_class = tutor OR mentor-of-an-enrolled-student). But the write is split BY VERB
-- so a mentor cannot DESTROY the tutor's calendar:
--   * INSERT / UPDATE  -> teaches_class  (tutor + mentor-of-mentee)
--   * DELETE           -> teaches_class_write (tutor + admin ONLY - never a mentor)
-- This avoids the FOR ALL over-grant (a single mentor DELETE could wipe a class's timetable /
-- every one-off event, irrecoverable). INSERT also pins created_by to the writer so a mentor
-- cannot forge authorship onto a tutor. Announcements/resources/assignments stay tutor-only.
--
-- App layer agrees by construction: createEvent/updateEvent gate on canWriteCalendar (mentor
-- OK); deleteEvent gates on canWriteClass (tutor-only, mirrors teaches_class_write); the
-- timetable "delete" is a soft UPDATE (active=false), so it rides the UPDATE policy.
-- Depends on 0079, 0043 (teaches_class / teaches_class_write), 0018 (current_profile_id), 0004.

begin;

-- ── Calendar events ──────────────────────────────────────────────────────────
drop policy if exists calendar_events_write on calendar_events;

create policy calendar_events_insert on calendar_events for insert with check (
  is_active_admin()
  or (class_id is not null and teaches_class(class_id) and created_by = current_profile_id())
);
create policy calendar_events_update on calendar_events for update using (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
) with check (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
);
-- DELETE is tutor/admin only: a mentor may create/edit but never destroy the calendar.
create policy calendar_events_delete on calendar_events for delete using (
  is_active_admin() or (class_id is not null and teaches_class_write(class_id))
);

-- ── Timetable slots ──────────────────────────────────────────────────────────
drop policy if exists timetable_slots_write on timetable_slots;

-- (tutor_id attribution is validated app-side by assertClassTutor -> isActiveClassTutor;
-- an RLS mirror would need a SECURITY DEFINER helper because class_tutors is itself
-- RLS-guarded, so it is left to the app layer for now.)
create policy timetable_slots_insert on timetable_slots for insert with check (
  is_active_admin() or teaches_class(class_id)
);
create policy timetable_slots_update on timetable_slots for update using (
  is_active_admin() or teaches_class(class_id)
) with check (
  is_active_admin() or teaches_class(class_id)
);
-- The app soft-deactivates (UPDATE active=false); a hard DELETE is tutor/admin only.
create policy timetable_slots_delete on timetable_slots for delete using (
  is_active_admin() or teaches_class_write(class_id)
);

commit;
