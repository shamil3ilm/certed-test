-- 0081_reaudit_submission_deadline_and_link_scheme.sql
-- Close the two A-03 residuals at the database boundary.
--
-- A-03 (a) — post-deadline write. submissions_update had no deadline term, so a direct
--   PostgREST update (e.g. a withdraw via the is_active column grant) still worked past
--   a hard deadline, unlike recordSubmission / replace_own_submission. Add the same
--   deadline predicate to the policy's USING clause.
--
-- A-03 (b) — unvalidated drive_link. replace_own_submission (0067) is the ONLY submission
--   insert path and stores p_drive_link verbatim; six sites render it as <a href>, so a
--   non-http(s) scheme (javascript:, data:) is a stored-XSS vector. The app's Zod check
--   (linkUrl) guards the form path only. Enforce the scheme at the COLUMN so every write
--   path is covered. '#' is the app's "no link" placeholder, so keep it allowed.
--
-- Depends on 0067 (replace_own_submission), 0035 (assignments.enforce_deadline), 0011
-- (submissions_update), 0003 (submissions, assignments).

begin;

-- A-03 (a) ------------------------------------------------------------------------
drop policy if exists submissions_update on submissions;
create policy submissions_update on submissions
  for update
  using (
    is_active_admin()
    or (
      is_self_active(student_id)
      and is_active = true
      and score is null
      and graded_at is null
      and not exists (
        select 1
        from assignments a
        where a.id = submissions.assignment_id
          and a.enforce_deadline
          and now() > a.due_date
      )
    )
  )
  with check (is_active_admin() or is_self_active(student_id));

-- A-03 (b) ------------------------------------------------------------------------
alter table submissions
  add constraint submissions_drive_link_scheme
  check (drive_link is null or drive_link = '#' or drive_link ~* '^https?://');

commit;
