-- 0012: make student resubmission replacement atomic. The old application flow
-- performed "deactivate current active row" and "insert next active row" as two
-- separate writes, which could leave a student with no active submission if the
-- second step failed after the first committed.

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

  insert into submissions (
    assignment_id,
    student_id,
    drive_link,
    file_name,
    is_active
  ) values (
    p_assignment_id,
    v_student_id,
    p_drive_link,
    p_file_name,
    true
  )
  returning *
  into v_created;

  return v_created;
end;
$$;

revoke execute on function replace_own_submission(uuid, text, text) from public;
grant execute on function replace_own_submission(uuid, text, text) to authenticated;
