-- 0111: starting a submission, activating an uploaded file, and editing an assignment each
-- become one guarded transaction.
--
--   start a submission  "does the student have an active submission?" read, THEN
--                       replace_own_submission - which REPLACES. Two files uploaded in parallel
--                       both found none; the second call deactivated the first submission, and
--                       file 1 hung off an inactive row no tutor sees.
--   activate a file     the attach checks (still active, ungraded, before a hard deadline; under
--                       the per-owner cap) ran BEFORE seconds of Drive upload, and the row was
--                       then flipped active unconditionally. A tutor grading mid-upload got a file
--                       on graded work; parallel uploads all counted under the cap. Replacing a
--                       document's file superseded the old one in a separate, best-effort write,
--                       and two concurrent replacements could each retire the other - leaving the
--                       document with no live file.
--   edit an assignment  the deadline and the reclassification were one call, but enforcement,
--                       type and end time were applied in a SECOND update. A failure between
--                       them moved the deadline without turning enforcement on, so late work was
--                       accepted - and an end time checked against the old deadline could fail
--                       the constraint (ends_at > due_date) that one update would have satisfied.
--
-- Also: at most one ACTIVE file per document, as an index. Where a document already has several,
-- the newest stays active - the one its download already serves.
--
-- These functions do not authorise their caller; the service does, then calls them with the
-- service role.

begin;

-- ── start (or reuse) a submission ───────────────────────────────────────────

-- {"id": uuid, "created": boolean}. The student's ACTIVE submission for the assignment, creating
-- an empty one only when there is none - under the same lock replace_own_submission takes, so
-- parallel uploads land on one submission. Refuses what a submission refuses:
-- assignment_not_found, deadline_passed, actor_not_active, not_enrolled.
create or replace function ensure_submission_for_student(p_assignment_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_id uuid;
begin
  select * into v_assignment from assignments where id = p_assignment_id and status = 'active';
  if not found then
    raise exception 'assignment_not_found';
  end if;
  if v_assignment.enforce_deadline and now() > v_assignment.due_date then
    raise exception 'deadline_passed';
  end if;
  perform 1 from profiles where id = p_student_id and status = 'active' for share;
  if not found then
    raise exception 'actor_not_active';
  end if;
  perform 1 from enrollments
   where student_id = p_student_id and class_id = v_assignment.class_id and active;
  if not found then
    raise exception 'not_enrolled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_assignment_id::text || ':' || p_student_id::text, 0));

  select id into v_id from submissions
   where assignment_id = p_assignment_id and student_id = p_student_id and is_active;
  if found then
    return jsonb_build_object('id', v_id, 'created', false);
  end if;

  insert into submissions (assignment_id, student_id, drive_link, file_name, is_active)
  values (p_assignment_id, p_student_id, null, null, true)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'created', true);
end;
$$;

-- ── activate an uploaded file ───────────────────────────────────────────────

with ranked as (
  select id, row_number() over (partition by resource_id order by created_at desc, id desc) as rn
    from attachments
   where resource_id is not null and status = 'active'
)
update attachments a set status = 'deleted', deleted_at = now()
  from ranked r
 where a.id = r.id and r.rn > 1;

create unique index if not exists attachments_one_active_per_resource
  on attachments (resource_id) where resource_id is not null and status = 'active';

-- Flip a pending upload active, re-checking its owner under a lock on the owner row:
--   submission    still the active, ungraded submission, on an active assignment whose hard
--                 deadline has not passed - else submission_closed
--   document      its previous active file is retired in the same step
--   anything else fewer than p_max_active files already active - else attachment_cap_reached
-- Also refuses attachment_not_found and attachment_not_pending.
create or replace function activate_attachment(
  p_id uuid,
  p_drive_file_id text,
  p_drive_folder_id text,
  p_max_active integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att attachments%rowtype;
  v_open boolean;
  v_active integer;
begin
  select * into v_att from attachments where id = p_id for update;
  if not found then
    raise exception 'attachment_not_found';
  end if;
  if v_att.status <> 'pending' then
    raise exception 'attachment_not_pending';
  end if;

  if v_att.resource_id is not null then
    perform 1 from resources where id = v_att.resource_id for update;
    -- Retire first: the one-active-file index would refuse the activation otherwise.
    update attachments set status = 'deleted', deleted_at = now()
     where resource_id = v_att.resource_id and status = 'active' and id <> p_id;
  else
    if v_att.submission_id is not null then
      select s.is_active and s.score is null and s.graded_at is null and a.status = 'active'
             and not (a.enforce_deadline and now() > a.due_date)
        into v_open
        from submissions s
        join assignments a on a.id = s.assignment_id
       where s.id = v_att.submission_id
         for update of s;
      if not coalesce(v_open, false) then
        raise exception 'submission_closed';
      end if;
      select count(*) into v_active from attachments where submission_id = v_att.submission_id and status = 'active';
    elsif v_att.announcement_id is not null then
      perform 1 from announcements where id = v_att.announcement_id for update;
      select count(*) into v_active from attachments where announcement_id = v_att.announcement_id and status = 'active';
    else
      perform 1 from assignments where id = v_att.assignment_id for update;
      select count(*) into v_active from attachments where assignment_id = v_att.assignment_id and status = 'active';
    end if;
    if v_active >= p_max_active then
      raise exception 'attachment_cap_reached';
    end if;
  end if;

  update attachments
     set status = 'active', drive_file_id = p_drive_file_id, drive_folder_id = p_drive_folder_id
   where id = p_id;
end;
$$;

-- ── edit an assignment ──────────────────────────────────────────────────────

drop function if exists edit_assignment_and_reclassify(uuid, text, text, timestamptz, text, text, numeric);

create or replace function edit_assignment_and_reclassify(
  p_id uuid,
  p_title text,
  p_description text,
  p_due_date timestamptz,
  p_attachment_drive_link text,
  p_topic text,
  p_max_marks numeric,
  p_enforce_deadline boolean,
  p_type text,
  p_expects_submission boolean,
  p_ends_at timestamptz
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
    max_marks = p_max_marks,
    enforce_deadline = p_enforce_deadline,
    type = p_type,
    expects_submission = p_expects_submission,
    ends_at = p_ends_at
  where id = p_id;

  if not found then
    raise exception 'assignment % not found', p_id;
  end if;

  -- Re-derive lateness against the new deadline, matching set_submission_status() (0009) and
  -- the app's computeStatus: submitted AFTER the due instant is 'late', at-or-before is
  -- 'submitted'. Only rows whose verdict actually changes are written.
  update submissions set
    status = case when submitted_at > p_due_date then 'late' else 'submitted' end
  where assignment_id = p_id
    and status <> (case when submitted_at > p_due_date then 'late' else 'submitted' end);
end;
$$;

revoke execute on function ensure_submission_for_student(uuid, uuid) from public, anon, authenticated;
grant execute on function ensure_submission_for_student(uuid, uuid) to service_role;
revoke execute on function activate_attachment(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function activate_attachment(uuid, text, text, integer) to service_role;
revoke execute on function edit_assignment_and_reclassify(uuid, text, text, timestamptz, text, text, numeric, boolean, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function edit_assignment_and_reclassify(uuid, text, text, timestamptz, text, text, numeric, boolean, text, boolean, timestamptz) to service_role;

commit;
