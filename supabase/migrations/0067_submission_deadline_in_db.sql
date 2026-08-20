-- 0067: enforce the assignment HARD DEADLINE in the database, not app code only.
--
-- enforce_deadline was checked only in recordSubmission (app-side). But the browser
-- holds a live Supabase session + the publishable key and can call PostgREST directly
-- (0009 / 0028 already acknowledge this threat model). Two paths reached `submissions`
-- past a hard deadline and neither knew about enforce_deadline:
--   A) the replace_own_submission RPC (granted to authenticated) - no deadline check;
--   B) a direct INSERT via the submissions_insert grant (0009).
-- This closes both. Depends on 0003 (submissions, due_date), 0012 (the RPC), 0035
-- (assignments.enforce_deadline).

-- Vector A: add the deadline guard INSIDE the security-definer RPC, mirroring
-- recordSubmission. Body is otherwise identical to 0012.
create or replace function replace_own_submission(
  p_assignment_id uuid,
  p_drive_link text,
  p_file_name text default null
) returns submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_student_id uuid;
  v_current submissions%rowtype;
  v_created submissions%rowtype;
begin
  select *
  into v_assignment
  from assignments
  where id = p_assignment_id and status = 'active';

  if not found then
    raise exception 'assignment_not_found';
  end if;

  -- Hard deadline: once the due instant has passed on an enforce_deadline assignment,
  -- no new/replacement submission is accepted - the rule recordSubmission applies.
  if v_assignment.enforce_deadline and now() > v_assignment.due_date then
    raise exception 'deadline_passed';
  end if;

  select id
  into v_student_id
  from profiles
  where auth_user_id = auth.uid() and status = 'active';

  if v_student_id is null then
    raise exception 'actor_not_active';
  end if;

  if not is_enrolled(v_assignment.class_id) then
    raise exception 'not_enrolled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_assignment_id::text || ':' || v_student_id::text, 0));

  select *
  into v_current
  from submissions
  where assignment_id = p_assignment_id
    and student_id = v_student_id
    and is_active = true
  for update;

  if found and v_current.score is not null then
    raise exception 'submission_already_graded';
  end if;

  update submissions
  set is_active = false
  where assignment_id = p_assignment_id
    and student_id = v_student_id
    and is_active = true;

  insert into submissions (assignment_id, student_id, drive_link, file_name, is_active)
  values (p_assignment_id, v_student_id, p_drive_link, p_file_name, true)
  returning *
  into v_created;

  return v_created;
end;
$$;

revoke execute on function replace_own_submission(uuid, text, text) from public;
grant execute on function replace_own_submission(uuid, text, text) to authenticated;

-- Vector B: the app inserts submissions ONLY through the RPC above (a security-definer
-- function, so it keeps working - it runs as its owner, not the caller). Revoke the
-- direct INSERT grant so a browser can't POST straight to the submissions table and
-- bypass the deadline (and the atomic-replace / already-graded guards) entirely.
revoke insert on table submissions from authenticated;
