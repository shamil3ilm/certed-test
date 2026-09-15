-- 0113: a custodial document becomes visible only once its file is live.
--
-- Uploading a file as a class document is two requests: create the document row, then upload the
-- file to it. The document was created ACTIVE and the class's students were notified at that
-- point - so a failed upload, or a closed tab, left a live document with no file that students had
-- already been told about, and a retry created another one beside it.
--
-- A custodial document is now created PENDING: every student read already requires
-- status = 'active' (resources_read), and the libraries list by status, so a draft is invisible.
-- activate_attachment publishes it in the same transaction that makes its first file live, and
-- tells the caller it did, so the "New document" notification goes out only for a document that
-- exists. A draft whose file never arrives is deleted by reconciliation.

begin;

alter table resources drop constraint if exists resources_status_check;
alter table resources
  add constraint resources_status_check check (status = any (array['pending'::text, 'active'::text, 'archived'::text]));

-- Same checks and writes as 0111, now returning whether this activation published a pending
-- document. The return type changes, so the function is replaced rather than redefined.
drop function if exists activate_attachment(uuid, text, text, integer);

create function activate_attachment(
  p_id uuid,
  p_drive_file_id text,
  p_drive_folder_id text,
  p_max_active integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att attachments%rowtype;
  v_open boolean;
  v_active integer;
  v_published boolean := false;
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
    update resources set status = 'active' where id = v_att.resource_id and status = 'pending';
    v_published := found;
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

  return v_published;
end;
$$;

revoke execute on function activate_attachment(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function activate_attachment(uuid, text, text, integer) to service_role;

commit;
