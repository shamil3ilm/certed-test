-- 0108: relationship writes that were two or more statements become one transaction each.
--
-- Each of these was a sequence of PostgREST calls from the service. Between the calls the
-- database held a state no rule allows, and a failure or a concurrent request could leave it
-- there:
--
--   capability override  delete the old override, then insert the new one. A validation
--                        failure after the delete dropped a standing DENY, which hands the
--                        capability back; two concurrent sets could both insert.
--   primary guardian     clear every primary, then set one. Two concurrent calls left two
--                        primaries; a stale guardian id left none.
--   mentorship           the link and the student-scoped mentor persona that grants access.
--                        An assign and a remove interleaving left an active persona behind an
--                        inactive link - access with nothing on the roster to show for it.
--   conversation         the conversation, then its participants. A failure left a direct
--                        thread with nobody in it, and the unique direct key then pointed
--                        every later attempt at that empty thread, so the pair could never
--                        message each other.
--   message              the message, then the conversation's last-message summary. A failure
--                        left the inbox stale, and two sends committing out of order moved it
--                        backwards.
--
-- None of these functions authorises its caller: the service checks authority, then calls
-- them with the service role. EXECUTE is therefore closed to the API roles.
--
-- Also: at most one primary guardian per student, as an index. Where a student already has
-- several, the earliest-added one stays primary - the one every guardian list already shows
-- first (primary, then oldest).

begin;

-- ── capability overrides ────────────────────────────────────────────────────

create or replace function set_global_capability_override(
  p_profile_id uuid,
  p_capability text,
  p_effect text,       -- 'allow' | 'deny' | 'default' (remove the override)
  p_reason text,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_effect not in ('allow', 'deny', 'default') then
    raise exception 'invalid_effect';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('capability-override:' || p_profile_id::text || ':' || p_capability, 0));

  -- An override is planted only on an active account: a dormant 'allow' would silently come
  -- back to life on restore. Clearing is always allowed.
  if p_effect <> 'default' then
    perform 1 from profiles where id = p_profile_id and status = 'active' for share;
    if not found then
      raise exception 'target_not_active';
    end if;
  end if;

  delete from capability_overrides
   where profile_id = p_profile_id and capability = p_capability and scope_type = 'global';

  if p_effect = 'default' then
    return null;
  end if;

  insert into capability_overrides (profile_id, capability, effect, scope_type, scope_id, reason, status, created_by)
  values (p_profile_id, p_capability, p_effect, 'global', null, p_reason, 'active', p_actor_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ── guardians ───────────────────────────────────────────────────────────────

with ranked as (
  select id, row_number() over (partition by student_id order by created_at, id) as rn
    from guardians
   where is_primary
)
update guardians g set is_primary = false
  from ranked r
 where g.id = r.id and r.rn > 1;

create unique index if not exists guardians_one_primary_per_student
  on guardians (student_id) where is_primary;

create or replace function add_guardian(
  p_student_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_relationship text,
  p_is_primary boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('guardians:' || p_student_id::text, 0));
  if p_is_primary then
    update guardians set is_primary = false where student_id = p_student_id and is_primary;
  end if;
  insert into guardians (student_id, name, phone, email, relationship, is_primary)
  values (p_student_id, p_name, p_phone, p_email, p_relationship, p_is_primary)
  returning id into v_id;
  return v_id;
end;
$$;

-- Returns false, changing nothing, when the guardian is not this student's.
create or replace function make_guardian_primary(p_student_id uuid, p_guardian_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('guardians:' || p_student_id::text, 0));
  perform 1 from guardians where id = p_guardian_id and student_id = p_student_id;
  if not found then
    return false;
  end if;
  -- Two statements, not one: the partial unique index is checked row by row, so clearing the
  -- old primary and setting the new one in a single UPDATE can collide with itself.
  update guardians set is_primary = false
   where student_id = p_student_id and is_primary and id <> p_guardian_id;
  update guardians set is_primary = true where id = p_guardian_id;
  return true;
end;
$$;

-- ── mentorships ─────────────────────────────────────────────────────────────

create or replace function assign_mentorship(p_mentor_id uuid, p_student_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Same key as remove_mentorship, so an assign and a remove of one pair take turns.
  perform pg_advisory_xact_lock(hashtextextended('mentorship:' || p_mentor_id::text || ':' || p_student_id::text, 0));

  perform 1 from profiles where id = p_mentor_id and role in ('mentor', 'tutor') and status = 'active' for share;
  if not found then
    raise exception 'mentor_not_assignable';
  end if;
  perform 1 from profiles where id = p_student_id and role = 'student' and status = 'active' for share;
  if not found then
    raise exception 'student_not_active';
  end if;

  insert into mentorships (mentor_id, student_id, active)
  values (p_mentor_id, p_student_id, true)
  on conflict (mentor_id, student_id) do update set active = true
  returning id into v_id;

  -- The persona is what grants access; the link alone grants nothing.
  insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
  values (p_mentor_id, 'mentor', 'student', p_student_id, 'active')
  on conflict (profile_id, persona_name, scope_id) do update set status = 'active', scope_type = 'student';

  return v_id;
end;
$$;

-- Returns false for an id that names no mentorship. An inactive one is removed again
-- idempotently.
create or replace function remove_mentorship(p_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentor uuid;
  v_student uuid;
begin
  -- Read the pair WITHOUT a row lock, take the pair lock, then write. Locking the row first
  -- would invert assign_mentorship's order (pair lock, then the row) and could deadlock.
  select mentor_id, student_id into v_mentor, v_student from mentorships where id = p_id;
  if not found then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mentorship:' || v_mentor::text || ':' || v_student::text, 0));

  delete from persona_assignments
   where profile_id = v_mentor and persona_name = 'mentor' and scope_type = 'student' and scope_id = v_student;
  update mentorships set active = false where id = p_id;
  return true;
end;
$$;

-- ── conversations and messages ──────────────────────────────────────────────

-- Returns {"id": uuid, "created": boolean}. A direct conversation that already exists is
-- returned as it is, with any missing participant added back.
create or replace function create_conversation(
  p_kind conversation_kind,
  p_title text,
  p_created_by uuid,
  p_direct_key text,
  p_participant_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_created boolean := false;
begin
  if coalesce(array_length(p_participant_ids, 1), 0) < 2 then
    raise exception 'too_few_participants';
  end if;

  if p_kind = 'direct' then
    if p_direct_key is null then
      raise exception 'direct_key_required';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('direct-conversation:' || p_direct_key, 0));
    select id into v_id from conversations where kind = 'direct' and direct_key = p_direct_key;
  end if;

  if v_id is null then
    insert into conversations (kind, title, created_by, last_message_at, direct_key)
    values (p_kind, p_title, p_created_by, now(), case when p_kind = 'direct' then p_direct_key end)
    returning id into v_id;
    v_created := true;
  end if;

  insert into conversation_participants (conversation_id, profile_id)
  select v_id, pid from unnest(p_participant_ids) as pid
  on conflict (conversation_id, profile_id) do nothing;

  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

create or replace function post_message(p_conversation_id uuid, p_sender_id uuid, p_body text) returns messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message messages%rowtype;
begin
  insert into messages (conversation_id, sender_id, body)
  values (p_conversation_id, p_sender_id, p_body)
  returning * into v_message;

  -- Never move the summary backwards: a send that commits after a later one leaves it alone.
  update conversations
     set last_message_at = v_message.created_at,
         last_message_body = v_message.body,
         last_message_sender_id = v_message.sender_id
   where id = p_conversation_id
     and (last_message_at is null or last_message_at <= v_message.created_at);

  return v_message;
end;
$$;

revoke execute on function set_global_capability_override(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function set_global_capability_override(uuid, text, text, text, uuid) to service_role;
revoke execute on function add_guardian(uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function add_guardian(uuid, text, text, text, text, boolean) to service_role;
revoke execute on function make_guardian_primary(uuid, uuid) from public, anon, authenticated;
grant execute on function make_guardian_primary(uuid, uuid) to service_role;
revoke execute on function assign_mentorship(uuid, uuid) from public, anon, authenticated;
grant execute on function assign_mentorship(uuid, uuid) to service_role;
revoke execute on function remove_mentorship(uuid) from public, anon, authenticated;
grant execute on function remove_mentorship(uuid) to service_role;
revoke execute on function create_conversation(conversation_kind, text, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function create_conversation(conversation_kind, text, uuid, text, uuid[]) to service_role;
revoke execute on function post_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function post_message(uuid, uuid, text) to service_role;

commit;
