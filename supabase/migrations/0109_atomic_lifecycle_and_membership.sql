-- 0109: account lifecycle, tutor assignment and the day's attendance session become single,
-- guarded transactions.
--
-- Each was a status check in the service followed by separate writes, with a compensating
-- write if a later step failed - and the compensations were themselves unguarded:
--
--   revoke    status flip, THEN deactivate personas. A failure between them was "rolled back"
--             by an unconditional status=active, which could re-activate an account a
--             concurrent erase or revoke had just acted on.
--   restore   "is it erased?" read, THEN status=active, THEN personas. An erase landing after
--             the read ended with an erased row marked active; a revoke interleaving ended
--             active with its sign-in still banned.
--   erase     "is it revoked?" read, THEN deletes and the PII scrub. A restore landing after the
--             read lost the PII of an account an admin had just restored. The scrub also
--             cleared auth_user_id even when deleting the sign-in had failed, leaving a live
--             auth account with a real email and nothing pointing at it, and a retry refused
--             because erased_at was already set.
--   tutor     membership, THEN the mentor's global tutor persona; removal counted the
--             remaining classes, THEN deactivated the persona. A concurrent assign between the
--             count and the deactivate stripped a persona still in use.
--   session   "does the day have a session?" read, THEN insert. Two markers created two
--             sessions for one lesson and split its marks across them.
--
-- Now every path locks the profile row (or the tutor, or the class-day) and re-checks state in
-- the same transaction as the write. Lock order is fixed so none can wait on another in a
-- cycle: an advisory key first, then row locks.
--
-- Also: an erased account must stay revoked, as a constraint. It is NOT VALID, so rows already
-- in breach do not block the migration; find them with
--   select id from profiles where erased_at is not null and status <> 'disabled';

begin;

-- ── helpers ─────────────────────────────────────────────────────────────────

-- The global row is (profile, persona) with scope_id NULL, which ON CONFLICT cannot target
-- (NULLs are distinct), so reactivate in place and insert only when there is none.
create or replace function activate_global_persona(p_profile_id uuid, p_persona persona_name) returns void
language plpgsql
set search_path = public
as $$
begin
  update persona_assignments set status = 'active'
   where profile_id = p_profile_id and persona_name = p_persona and scope_type = 'global';
  if not found then
    insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
    values (p_profile_id, p_persona, 'global', null, 'active');
  end if;
end;
$$;

create or replace function lock_tutor_persona(p_profile_id uuid) returns void
language sql
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended('class-tutor-persona:' || p_profile_id::text, 0));
$$;

-- ── revoke ──────────────────────────────────────────────────────────────────

create or replace function revoke_profile_guarded(p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_status text;
  v_active_admins int;
begin
  -- Serialize every admin-tier revocation on one constant key, so the last-admin count and
  -- the status flip are a single atomic step across rows.
  perform pg_advisory_xact_lock(hashtextextended('profiles:admin-tier-guard'::text, 0));

  select role, status into v_role, v_status from profiles where id = p_target for update;
  if not found then
    return 'not_found';
  end if;

  if v_role = 'admin' and v_status = 'active' then
    select count(*) into v_active_admins from profiles where role = 'admin' and status = 'active';
    if v_active_admins <= 1 then
      return 'last_admin';
    end if;
  end if;

  update profiles set status = 'disabled' where id = p_target;
  -- Every scope, not just global: a revoked mentor's student-scoped personas are what grant
  -- mentee access. The mentorship and class_tutors rows stay, so restore can rebuild them.
  update persona_assignments set status = 'inactive' where profile_id = p_target;
  return 'ok';
end;
$$;

-- ── restore ─────────────────────────────────────────────────────────────────

-- 'ok' | 'not_found' | 'erased'
create or replace function restore_profile_guarded(p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_erased timestamptz;
begin
  -- Same key assign_class_tutor and unassign_class_tutor take, so the tutor persona restored
  -- below agrees with the class assignments that exist when this commits.
  perform lock_tutor_persona(p_target);

  select role, erased_at into v_role, v_erased from profiles where id = p_target for update;
  if not found then
    return 'not_found';
  end if;
  -- Erasure is terminal: its sign-in and PII are gone.
  if v_erased is not null then
    return 'erased';
  end if;

  update profiles set status = 'active' where id = p_target;

  -- The persona matching the role (role and persona share their names).
  perform activate_global_persona(p_target, v_role::text::persona_name);
  -- A mentor who also teaches: assignments survive revocation, so their tutor persona returns.
  if exists (select 1 from class_tutors where tutor_id = p_target and active) then
    perform activate_global_persona(p_target, 'tutor');
  end if;
  -- Mentee reach, rebuilt from the surviving mentorship graph.
  insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
  select p_target, 'mentor', 'student', m.student_id, 'active'
    from mentorships m
   where m.mentor_id = p_target and m.active
  on conflict (profile_id, persona_name, scope_id) do update set status = 'active', scope_type = 'student';

  return 'ok';
end;
$$;

-- ── erase ───────────────────────────────────────────────────────────────────

-- {"outcome": 'erased' | 'already_erased' | 'not_disabled' | 'not_found', "auth_user_id": uuid|null}
--
-- auth_user_id is returned and KEPT: the sign-in lives in the identity provider, outside this
-- transaction, so the link is cleared only once the service has deleted it. A failed delete
-- leaves the link in place, and running erase again finishes the job.
create or replace function erase_profile_guarded(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status user_status;
  v_erased timestamptz;
  v_auth uuid;
begin
  select status, erased_at, auth_user_id into v_status, v_erased, v_auth
    from profiles where id = p_target for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found', 'auth_user_id', null);
  end if;
  if v_erased is not null then
    return jsonb_build_object('outcome', 'already_erased', 'auth_user_id', v_auth);
  end if;
  if v_status <> 'disabled' then
    return jsonb_build_object('outcome', 'not_disabled', 'auth_user_id', null);
  end if;

  -- Pastoral notes ABOUT the person, and guardians' contact details (third-party PII). The
  -- profile row is kept for audit and finance references, so its FK cascades never fire.
  delete from mentee_notes where student_id = p_target;
  delete from guardians where student_id = p_target;

  update profiles
     set full_name = 'Erased user',
         email = 'erased+' || p_target::text || '@erased.invalid',
         phone = null,
         guardian_name = null,
         guardian_phone = null,
         date_of_birth = null,
         country = null,
         class_level = null,
         qualifications = null,
         bio = null,
         setup_code_hash = null,
         setup_code_expires_at = null,
         status = 'disabled',
         erased_at = now()
   where id = p_target;

  return jsonb_build_object('outcome', 'erased', 'auth_user_id', v_auth);
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_erased_stays_disabled') then
    alter table profiles
      add constraint profiles_erased_stays_disabled check (erased_at is null or status = 'disabled') not valid;
  end if;
end $$;

-- ── tutor assignment ────────────────────────────────────────────────────────

create or replace function assign_class_tutor(p_class_id uuid, p_tutor_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  perform lock_tutor_persona(p_tutor_id);

  select role into v_role from profiles
   where id = p_tutor_id and role in ('tutor', 'mentor') and status = 'active'
     for share;
  if not found then
    raise exception 'tutor_not_assignable';
  end if;
  perform 1 from classes where id = p_class_id and status = 'active' for share;
  if not found then
    raise exception 'class_not_active';
  end if;

  insert into class_tutors (tutor_id, class_id, active)
  values (p_tutor_id, p_class_id, true)
  on conflict (tutor_id, class_id) do update set active = true;

  -- A dedicated mentor who teaches needs the tutor persona for the teaching workflows.
  if v_role = 'mentor' then
    perform activate_global_persona(p_tutor_id, 'tutor');
  end if;
end;
$$;

-- Returns false, changing nothing, when the tutor was never assigned to the class.
create or replace function unassign_class_tutor(p_class_id uuid, p_tutor_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform lock_tutor_persona(p_tutor_id);

  update class_tutors set active = false where class_id = p_class_id and tutor_id = p_tutor_id;
  if not found then
    return false;
  end if;

  -- A dedicated mentor who no longer teaches anything loses the tutor persona teaching gave
  -- them. A tutor keeps theirs: it is their identity, not a grant.
  if exists (select 1 from profiles where id = p_tutor_id and role = 'mentor' and status = 'active')
     and not exists (select 1 from class_tutors where tutor_id = p_tutor_id and active) then
    update persona_assignments set status = 'inactive'
     where profile_id = p_tutor_id and persona_name = 'tutor' and scope_type = 'global';
  end if;
  return true;
end;
$$;

-- ── the day's attendance session ────────────────────────────────────────────

-- The day's first session (earliest recorded start, then oldest), creating a timeless one when
-- the day has none. Serialised per class and day, so two markers share one session.
create or replace function ensure_day_session(p_class_id uuid, p_session_date date) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('day-session:' || p_class_id::text || ':' || p_session_date::text, 0));

  select id into v_id
    from class_sessions
   where class_id = p_class_id and session_date = p_session_date
   order by actual_start asc nulls first, created_at asc
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into class_sessions (class_id, session_date)
  values (p_class_id, p_session_date)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function activate_global_persona(uuid, persona_name) from public, anon, authenticated;
revoke execute on function lock_tutor_persona(uuid) from public, anon, authenticated;
revoke execute on function revoke_profile_guarded(uuid) from public, anon, authenticated;
grant execute on function revoke_profile_guarded(uuid) to service_role;
revoke execute on function restore_profile_guarded(uuid) from public, anon, authenticated;
grant execute on function restore_profile_guarded(uuid) to service_role;
revoke execute on function erase_profile_guarded(uuid) from public, anon, authenticated;
grant execute on function erase_profile_guarded(uuid) to service_role;
revoke execute on function assign_class_tutor(uuid, uuid) from public, anon, authenticated;
grant execute on function assign_class_tutor(uuid, uuid) to service_role;
revoke execute on function unassign_class_tutor(uuid, uuid) from public, anon, authenticated;
grant execute on function unassign_class_tutor(uuid, uuid) to service_role;
revoke execute on function ensure_day_session(uuid, date) from public, anon, authenticated;
grant execute on function ensure_day_session(uuid, date) to service_role;

commit;
