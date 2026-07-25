-- Migration 0026: edit an assignment and re-derive its submissions' lateness
--                 atomically, in one transaction.
--
-- Why: editing an assignment's due date must also re-stamp every submission's
-- on-time/late status (a verdict computed against the OLD deadline is wrong once
-- the deadline moves). The app did the assignment UPDATE and the submissions
-- UPDATE as two separate round-trips through two different clients, with a
-- hand-rolled compensating rollback - which could itself fail and leave the two
-- tables permanently disagreeing (assignment on the new date, submissions on the
-- old, or vice-versa). Doing both inside one SECURITY DEFINER function makes them
-- a single transaction: either both land or neither does, with no manual rollback
-- and no stale-snapshot overwrite.
--
-- Authorization is the caller's job (the service asserts canManageClass on the
-- assignment's own class before invoking this), exactly like the grading and
-- issuance functions. Execute is therefore revoked from the client roles.
--
-- Idempotent: CREATE OR REPLACE, and re-running the function is a plain UPDATE.

create or replace function edit_assignment_and_reclassify(
  p_id uuid,
  p_title text,
  p_description text,
  p_due_date timestamptz,
  p_attachment_drive_link text,
  p_topic text,
  p_max_marks numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update assignments set
    title = p_title,
    description = p_description,
    due_date = p_due_date,
    attachment_drive_link = p_attachment_drive_link,
    topic = p_topic,
    max_marks = p_max_marks
  where id = p_id;

  if not found then
    raise exception 'assignment % not found', p_id;
  end if;

  -- Re-derive lateness against the new deadline, matching set_submission_status()
  -- (0009) and the app's computeStatus: submitted AFTER the due instant is 'late',
  -- at-or-before is 'submitted'. Only rows whose verdict actually changes are
  -- written.
  update submissions set
    status = case when submitted_at > p_due_date then 'late' else 'submitted' end
  where assignment_id = p_id
    and status <> (case when submitted_at > p_due_date then 'late' else 'submitted' end);
end;
$$;

revoke execute on function edit_assignment_and_reclassify(uuid, text, text, timestamptz, text, text, numeric) from public;
revoke execute on function edit_assignment_and_reclassify(uuid, text, text, timestamptz, text, text, numeric) from anon;
revoke execute on function edit_assignment_and_reclassify(uuid, text, text, timestamptz, text, text, numeric) from authenticated;
