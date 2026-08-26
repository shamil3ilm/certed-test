-- 0082_mentor_calendar_write.sql
--
-- Let a MENTOR manage the calendar (one-off events + timetable slots) for a class their
-- mentee is enrolled in - a deliberate product decision so a mentor can coordinate
-- mentoring sessions for their mentee.
--
-- 0079 (A-07) narrowed EVERY class-scoped write to tutor-only (teaches_class_write) to
-- close the mentor-write LEAK on class CONTENT. Calendar is not content: repoint just the
-- two CALENDAR write policies back to teaches_class (tutor OR mentor-of-an-enrolled-student),
-- while announcements/resources/assignments/meet_links stay tutor-only on teaches_class_write.
-- The *_read policies are unchanged (mentors already read the calendar). A global (null
-- class) event stays admin-only. Depends on 0079, 0043 (teaches_class), 0004.
--
-- App layer agrees by construction: the calendar-events / timetable-slots services now gate
-- on canWriteCalendar (mirrors teaches_class) instead of canWriteClass (teaches_class_write),
-- and the mentor persona gains the manageCalendar capability.

begin;

drop policy if exists calendar_events_write on calendar_events;
create policy calendar_events_write on calendar_events for all using (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
) with check (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
);

drop policy if exists timetable_slots_write on timetable_slots;
create policy timetable_slots_write on timetable_slots for all using (
  is_active_admin() or teaches_class(class_id)
) with check (
  is_active_admin() or teaches_class(class_id)
);

commit;
