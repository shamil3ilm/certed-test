-- 0085_class_sessions_read_attended_only.sql
--
-- R-05: class_sessions_read (0047) let ANY enrolled student SELECT every session row of the
-- class, and student_feedback is a scalar on that row with a SELECT column grant. Classes are
-- reused as students rotate (enrollments are one-active-per-class), so an INCOMING student read
-- the PRIOR occupant's candid feedback - and the tutor being reviewed could read it too, for
-- dates the new student never attended. 0068/0077 hardened the feedback WRITE; the READ was
-- left class-wide.
--
-- Narrow the STUDENT branch from is_enrolled(class) to "has an attendance record for THIS
-- session" (the same date), so a student reads only sessions they actually attended - which is
-- exactly the set the attendance page shows them (it maps sessions from their own attendance
-- rows via the RLS client). Staff (admin / teaches_class = tutor or mentor-of-enrolled) keep the
-- full oversight read, unchanged. Depends on 0047, 0008 (attendance).

begin;

drop policy if exists class_sessions_read on class_sessions;
create policy class_sessions_read on class_sessions for select using (
  is_active_admin()
  or teaches_class(class_id)
  or exists (
    select 1
    from attendance a
    join profiles p on p.id = a.student_id
    where a.class_id = class_sessions.class_id
      and a.session_date = class_sessions.session_date
      and p.auth_user_id = auth.uid()
      and p.status = 'active'
  )
);

commit;
