-- 0068_class_sessions_student_feedback_rls.sql
-- Lets an enrolled student write ONLY their session feedback through their own RLS
-- session, instead of the service-role client that bypassed RLS. Column privileges
-- limit the writable columns to student_feedback; the policies limit the rows to the
-- student's enrolled class and a date they actually attended. Tutor/admin writes are
-- unchanged (they keep the class_sessions_write policy / service role).

begin;

-- Role-wide column grants; the policies below decide WHICH rows. Together a student
-- may only create a feedback-only row or set student_feedback - never tutor times,
-- summary, or any other column.
grant insert (class_id, session_date, student_feedback) on class_sessions to authenticated;
grant update (student_feedback) on class_sessions to authenticated;

-- INSERT: the student's enrolled class, and only for a date they have attendance for -
-- the feedback field is surfaced per attended session, and this stops a crafted write
-- from creating class_sessions rows for arbitrary dates.
drop policy if exists class_sessions_student_feedback_insert on class_sessions;
create policy class_sessions_student_feedback_insert on class_sessions
  for insert to authenticated
  with check (
    is_enrolled(class_id)
    and exists (
      select 1 from attendance a
      where a.class_id = class_sessions.class_id
        and a.student_id = current_profile_id()
        and a.session_date = class_sessions.session_date
    )
  );

-- UPDATE: same row scope (the column grant already limits the write to student_feedback).
drop policy if exists class_sessions_student_feedback_update on class_sessions;
create policy class_sessions_student_feedback_update on class_sessions
  for update to authenticated
  using (
    is_enrolled(class_id)
    and exists (
      select 1 from attendance a
      where a.class_id = class_sessions.class_id
        and a.student_id = current_profile_id()
        and a.session_date = class_sessions.session_date
    )
  )
  with check (is_enrolled(class_id));

commit;
