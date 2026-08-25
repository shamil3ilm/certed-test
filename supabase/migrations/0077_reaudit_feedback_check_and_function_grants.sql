-- 0077_reaudit_feedback_check_and_function_grants.sql
-- Two low-risk hardenings from the 2026-08-25 re-audit.
--
-- R-04: class_sessions_student_feedback_update's WITH CHECK was only is_enrolled(),
--       weaker than its USING (which also requires an attendance row). That made the
--       row-security invariant depend on the column grant alone; it fails the moment
--       authenticated holds table-wide UPDATE or a new student-writable column is added.
--       Mirror the full attendance predicate into WITH CHECK so the policy self-enforces.
--
-- R-12: mentors_class, finance_totals_base and set_updated_at missed the
--       "REVOKE ALL ... FROM PUBLIC" invariant 0034 established; finance_totals_base
--       also lacked a pinned search_path. No live impact today, but the pattern had
--       untracked exceptions - close them.

begin;

-- R-04 ---------------------------------------------------------------------------
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
  with check (
    is_enrolled(class_id)
    and exists (
      select 1 from attendance a
      where a.class_id = class_sessions.class_id
        and a.student_id = current_profile_id()
        and a.session_date = class_sessions.session_date
    )
  );

-- R-12 ---------------------------------------------------------------------------
-- Revoke PUBLIC execute (the authenticated/service_role grants these functions need
-- are separate and unaffected). Pin the one INVOKER function's search_path.
revoke all on function mentors_class(uuid) from public;
revoke all on function finance_totals_base(text) from public;
revoke all on function set_updated_at() from public;
alter function finance_totals_base(text) set search_path = public;

commit;
