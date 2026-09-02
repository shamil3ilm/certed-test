-- 0083_mentor_write_no_hard_delete.sql
--
-- attendance_write (0008) and class_sessions_write (0047) are FOR ALL, and 0079 kept them on
-- teaches_class so a mentor may EDIT attendance + session times (manageAttendance). But FOR ALL
-- means "edit" silently included DELETE: a mentor (or the tutor) could hard-DELETE a minor's
-- attendance row (a guardian-reporting / retention artefact) or a whole class_sessions row -
-- destroying the staff-private staff_note that 0070 deliberately hides from mentors/students.
-- Confidentiality was hardened while integrity was left open.
--
-- Split by verb: INSERT/UPDATE stay on teaches_class (the intended edit authority, with
-- attendance's active-enrollment WITH CHECK preserved); DELETE becomes ADMIN-ONLY. The app
-- clears attendance through the SERVICE ROLE (createAdminClient, bypasses RLS), and never
-- hard-deletes class_sessions, so this changes no app path - it only closes the raw-PostgREST
-- DELETE. Depends on 0008, 0047, 0079.

begin;

-- ── Attendance ───────────────────────────────────────────────────────────────
drop policy if exists attendance_write on attendance;
create policy attendance_insert on attendance for insert with check (
  (is_active_admin() or teaches_class(class_id))
  and exists (
    select 1 from enrollments e
    where e.class_id = attendance.class_id and e.student_id = attendance.student_id and e.active
  )
);
create policy attendance_update on attendance for update using (
  is_active_admin() or teaches_class(class_id)
) with check (
  (is_active_admin() or teaches_class(class_id))
  and exists (
    select 1 from enrollments e
    where e.class_id = attendance.class_id and e.student_id = attendance.student_id and e.active
  )
);
create policy attendance_delete on attendance for delete using (is_active_admin());

-- ── Class sessions ───────────────────────────────────────────────────────────
-- (Leaves the separate class_sessions_student_feedback_* policies from 0068 untouched.)
drop policy if exists class_sessions_write on class_sessions;
create policy class_sessions_insert on class_sessions for insert with check (
  is_active_admin() or teaches_class(class_id)
);
create policy class_sessions_update on class_sessions for update using (
  is_active_admin() or teaches_class(class_id)
) with check (
  is_active_admin() or teaches_class(class_id)
);
create policy class_sessions_delete on class_sessions for delete using (is_active_admin());

commit;
