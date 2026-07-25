-- 0028: close a direct-PostgREST bypass on submissions.is_active.
--
-- The submissions_update policy (0017) checked ownership only
-- (is_active_admin() OR is_self_active(student_id)), and 0009 grants
-- UPDATE(is_active) to `authenticated`. Because the browser can call PostgREST
-- directly, a signed-in student could PATCH their own row's is_active without
-- going through the app's withdraw flow. That let them:
--   * deactivate their own GRADED submission -> it drops out of every
--     is_active=true read (assignment lists, report card) - erasing a grade; or
--   * reactivate a superseded row, bypassing replace_own_submission's
--     submission_already_graded guard.
-- The app's markInactiveForStudent already restricts withdraw to active+ungraded
-- rows, but that is an app-layer filter, not the trust boundary. Narrow the
-- student branch of the policy to the same invariant so RLS enforces it too.
--
-- Only the USING clause (the row as it exists before the update) needs the
-- grading-state guard: a student may only touch a row that is CURRENTLY active
-- and ungraded - exactly what a withdraw needs. WITH CHECK stays ownership-only
-- so setting is_active=false is still allowed. Admin/service-role paths and
-- resubmit (replace_own_submission, SECURITY DEFINER) are unaffected; students
-- cannot update score/graded_at anyway (no column grant for those).
drop policy if exists submissions_update on submissions;
create policy submissions_update on submissions for update using (
  is_active_admin()
  or (is_self_active(student_id) and is_active = true and score is null and graded_at is null)
) with check (
  is_active_admin()
  or is_self_active(student_id)
);
