-- Migration 0022: authorization hardening - RLS recursion, helper safety, self-reads,
--                 and a single admin authority.
--
-- Consolidates what was drafted as four separate migrations (0022-0024, 0026) while
-- none of them had been applied. They are one change: every part fixes the same
-- surface - how the database decides who is an admin and who may read the
-- authorization tables - and applying any subset leaves that surface inconsistent.
--
-- Ordering inside this file matters: the helpers are hardened BEFORE the policies
-- that call them are rewritten to depend on them.

--                 (user_has_persona / user_is_admin / user_is_mentor_for_student)
--
-- Why: 0022 made user_is_admin() the SOLE admin gate on the authorization tables
--      (persona_assignments, capability_overrides). The 0016 helpers had three
--      gaps that make that gate unsafe:
--
--   1. Account status ignored. user_has_persona checked only the persona ROW's
--      status, never the holder's profiles.status. A disabled admin whose persona
--      row is still active, holding a live JWT, passed user_is_admin() and could
--      re-write the authz tables to self-restore. Now the holder's account must
--      ALSO be active - matching the app's accessState rule and the is_self_active
--      / is_active_admin RLS helpers.
--
--   2. Mutable search_path on SECURITY DEFINER functions. A caller could set a
--      hostile search_path and have the definer resolve persona_assignments /
--      profiles to attacker-controlled tables. Pin `search_path = public` (the
--      same pattern as mentors_student in 0021).
--
--   3. EXECUTE granted to PUBLIC. Any role, including anon, could probe
--      user_is_admin(<anyone's uuid>) as a persona-enumeration oracle. Restrict
--      EXECUTE to authenticated + service_role (the only roles that legitimately
--      evaluate these - the 0022 policies run as authenticated, trusted server
--      code as service_role; no anon path references them).
--
-- Idempotent (create or replace + revoke/grant). Safe to re-run on any environment
-- at >= 0022. Depends on: 0014 (persona tables), 0016 (the helpers), 0001 (profiles.status).

-- Guard: the helpers must already exist (0016) so this only ever HARDENS them.
do $$
begin
  if to_regprocedure('public.user_has_persona(uuid, persona_name, persona_scope_type, uuid)') is null then
    raise exception 'user_has_persona(...) is missing - apply migration 0016 before 0022.';
  end if;
end $$;

-- 1 + 2: add the profiles.status='active' factor and pin the search_path.
create or replace function user_has_persona(
  p_user_id uuid,
  p_persona persona_name,
  p_scope_type persona_scope_type default 'global'::persona_scope_type,
  p_scope_id uuid default null
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return exists (
    select 1
    from persona_assignments pa
    join profiles p on p.id = pa.profile_id and p.status = 'active'
    where pa.profile_id = p_user_id
      and pa.persona_name = p_persona
      and pa.scope_type = p_scope_type
      and (
        (p_scope_type = 'global' and pa.scope_id is null) or
        (p_scope_type != 'global' and pa.scope_id = p_scope_id)
      )
      and pa.status = 'active'
  );
end;
$$;

create or replace function user_is_admin(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return user_has_persona(p_user_id, 'admin'::persona_name);
end;
$$;

create or replace function user_is_mentor_for_student(
  p_user_id uuid,
  p_student_id uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return user_has_persona(
    p_user_id,
    'mentor'::persona_name,
    'student'::persona_scope_type,
    p_student_id
  );
end;
$$;

-- 3: lock down EXECUTE - no PUBLIC (kills the anon enumeration oracle).
revoke execute on function user_has_persona(uuid, persona_name, persona_scope_type, uuid) from public;
revoke execute on function user_is_admin(uuid) from public;
revoke execute on function user_is_mentor_for_student(uuid, uuid) from public;

grant execute on function user_has_persona(uuid, persona_name, persona_scope_type, uuid) to authenticated, service_role;
grant execute on function user_is_admin(uuid) to authenticated, service_role;
grant execute on function user_is_mentor_for_student(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------

-- Purpose: The admin policies in 0014 (persona_assignments) and 0020 (capability_overrides)
--          authorize with an INLINE self-referential subquery
--              EXISTS (SELECT 1 FROM persona_assignments pa_admin WHERE ...)
--          On persona_assignments that subquery reads the SAME table the policy governs,
--          so Postgres raises on EVERY read of the table:
--              42P17: infinite recursion detected in policy for relation "persona_assignments"
--          getActorContext() (src/lib/session/actor-context.ts) reads persona_assignments
--          with the RLS client to resolve capabilities; the read errors and is swallowed,
--          so every role resolves to ZERO capabilities -> empty nav + blank dashboard for
--          all users. Populating the table cannot fix it because the read itself fails.
-- Fix:     Authorize via the SECURITY DEFINER helper user_is_admin(profile_id) from 0016.
--          Its internal read bypasses RLS, so there is no recursion. The 0014 self-read
--          policy ("Users can read own persona assignments") is already recursion-free
--          (reads profiles) and is what the app relies on to resolve a user's own caps.
-- Depends on: 0014 (persona_assignments + policies), 0016 (user_is_admin / user_has_persona),
--             0020 (capability_overrides + policies)
-- Status: Idempotent (drop-if-exists + create). Safe to re-run on any environment at >= 0020.

-- Guard: fail loudly if the SECURITY DEFINER helper is missing, rather than silently
-- recreating policies that would still recurse.
do $$
begin
  if to_regprocedure('public.user_is_admin(uuid)') is null then
    raise exception 'user_is_admin(uuid) is missing - apply migration 0016 before 0022.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- persona_assignments: replace the 4 self-referential admin policies (0014)
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can read all persona assignments" on persona_assignments;
create policy "Admins can read all persona assignments"
  on persona_assignments for select
  using (user_is_admin((select id from profiles where auth_user_id = auth.uid())));

drop policy if exists "Only admins can insert persona assignments" on persona_assignments;
create policy "Only admins can insert persona assignments"
  on persona_assignments for insert
  with check (user_is_admin((select id from profiles where auth_user_id = auth.uid())));

drop policy if exists "Only admins can update persona assignments" on persona_assignments;
create policy "Only admins can update persona assignments"
  on persona_assignments for update
  using (user_is_admin((select id from profiles where auth_user_id = auth.uid())));

drop policy if exists "Only admins can delete persona assignments" on persona_assignments;
create policy "Only admins can delete persona assignments"
  on persona_assignments for delete
  using (user_is_admin((select id from profiles where auth_user_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- capability_overrides: same inline pattern (0020); rewrite via the helper too.
-- The app's own override read uses the self-read policy and is unaffected, but the
-- admin-management policies carry the same fragile cross-table subquery.
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can read all capability overrides" on capability_overrides;
create policy "Admins can read all capability overrides"
  on capability_overrides for select
  using (user_is_admin((select id from profiles where auth_user_id = auth.uid())));

drop policy if exists "Only admins can insert capability overrides" on capability_overrides;
create policy "Only admins can insert capability overrides"
  on capability_overrides for insert
  with check (user_is_admin((select id from profiles where auth_user_id = auth.uid())));

drop policy if exists "Only admins can update capability overrides" on capability_overrides;
create policy "Only admins can update capability overrides"
  on capability_overrides for update
  using (user_is_admin((select id from profiles where auth_user_id = auth.uid())));

drop policy if exists "Only admins can delete capability overrides" on capability_overrides;
create policy "Only admins can delete capability overrides"
  on capability_overrides for delete
  using (user_is_admin((select id from profiles where auth_user_id = auth.uid())));

-- ---------------------------------------------------------------------------

--
-- Why: 0014 (persona_assignments) and 0020 (capability_overrides) let a user read
--      their OWN rows via `profile_id = (select id from profiles where auth_user_id
--      = auth.uid())`, which never checks the caller's ACCOUNT status. Every other
--      self-read policy (0011/0017) uses is_self_active() so a disabled user with a
--      stale JWT cannot read their own rows. Bring these two into line: defense in
--      depth for the authz tables specifically. The app already blocks disabled
--      users (accessState) and 0023 stops a disabled persona from granting admin;
--      this closes the DB-layer read gap too, and a disabled user simply resolves
--      to zero personas/overrides (they are redirected by the guards regardless).
--
-- Idempotent (drop-if-exists + create). Depends on: 0011 (is_self_active),
-- 0014 (persona_assignments + self-read policy), 0020 (capability_overrides + self-read).

do $$
begin
  if to_regprocedure('public.is_self_active(uuid)') is null then
    raise exception 'is_self_active(uuid) is missing - apply migration 0011 before 0022.';
  end if;
end $$;

drop policy if exists "Users can read own persona assignments" on persona_assignments;
create policy "Users can read own persona assignments"
  on persona_assignments for select
  using (is_self_active(profile_id));

drop policy if exists "Users can read own capability overrides" on capability_overrides;
create policy "Users can read own capability overrides"
  on capability_overrides for select
  using (is_self_active(profile_id));

-- ---------------------------------------------------------------------------

-- the persona-based user_is_admin().
--
-- Why: is_active_admin() (0001) tested profiles.role = 'admin' directly - a SECOND
--      "is admin" authority running parallel to the persona model that user_is_admin
--      (0016) + 0022/0023 established, and it gates nearly every domain-table RLS
--      policy (profiles, org_settings, receipts/payslips, enrollments, mentorships,
--      submissions, attendance, comments, class_tutors, ...). The two agree today
--      only because syncPersonaForRole keeps profiles.role and the admin persona 1:1;
--      any future path that granted or removed the admin persona without also
--      touching profiles.role would silently desync database-level admin from the
--      app's capability model. Redefining is_active_admin() in terms of user_is_admin
--      removes the second authority outright - every policy that already calls
--      is_active_admin() now decides against the same persona + active-status check,
--      with no policy rewrites.
--
-- Recursion-safe: user_is_admin() is SECURITY DEFINER and reads persona_assignments /
--      profiles with RLS bypassed, so this never re-enters a governed table's policy
--      (the same property 0022 relied on). Fails closed on desync: a role='admin' row
--      whose admin persona is missing/inactive is no longer treated as admin - which
--      is the intended source-of-truth behaviour (0015 populated personas for all
--      existing users; restorePersonasForProfile self-heals the global persona).
--
-- Idempotent (create or replace). Depends on: 0001 (is_active_admin), 0016/0023
--      (user_is_admin).

do $$
begin
  if to_regprocedure('public.user_is_admin(uuid)') is null then
    raise exception 'user_is_admin(uuid) is missing - apply migrations 0016 and 0023 before 0022.';
  end if;
end $$;

create or replace function is_active_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select public.user_is_admin((select id from profiles where auth_user_id = auth.uid()))
$$;
