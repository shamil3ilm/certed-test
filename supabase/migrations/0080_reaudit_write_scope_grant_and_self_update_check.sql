-- 0080_reaudit_write_scope_grant_and_self_update_check.sql
-- Two hardenings from the 2026-08-25 re-audit follow-up (N-08, R-01).
--
-- N-08: 0079 added teaches_class_write() and granted EXECUTE to authenticated, but
--       skipped the "REVOKE ALL ... FROM PUBLIC" invariant that 0034 established and
--       0077 (R-12) restored for the other helpers. It became the ONE function in the
--       schema still holding a PUBLIC execute grant. Close it - same pattern as 0077.
--       (Its search_path is already pinned in 0079, so only the revoke is needed.)
--
-- R-01: profiles_self_update had a USING clause but no WITH CHECK, so PostgreSQL reused
--       USING for the post-image check. In production that is masked: 0001 revokes
--       table-wide UPDATE on profiles from authenticated and grants only
--       (full_name, class_level), so a self-update physically cannot touch role/status/
--       auth_user_id. But a snapshot-provisioned DB that restores the schema WITHOUT
--       those column grants (the R-01 snapshot gap) would let a signed-in user flip
--       their own role to admin through this policy - direct privilege escalation.
--       Add defence-in-depth that survives a plain schema dump (unlike a column GRANT):
--         (a) an explicit WITH CHECK on the policy (post-image must still be the caller's
--             own row, or an admin), and
--         (b) a BEFORE UPDATE trigger that forbids a signed-in NON-admin from changing
--             role, status, or auth_user_id at all. Trusted server writes (service role,
--             which carries no auth.uid()) and admins pass through unchanged, so the
--             registration bind and the admin lifecycle flows are unaffected.

begin;

-- N-08 ---------------------------------------------------------------------------
revoke all on function teaches_class_write(uuid) from public;

-- R-01 (a): give the self-update policy an explicit WITH CHECK -------------------
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update
  using ((auth_user_id = auth.uid()) or public.is_active_admin())
  with check ((auth_user_id = auth.uid()) or public.is_active_admin());

-- R-01 (b): trigger guard on the privileged columns -----------------------------
-- A signed-in non-admin may only ever edit their own descriptive fields; the
-- escalation-sensitive columns are off limits regardless of what column grants a
-- given deployment happens to carry. auth.uid() IS NULL means a service-role /
-- trusted server write (RLS-bypassing), which is allowed - that is how registration
-- binds auth_user_id and how the admin lifecycle sets role/status.
create or replace function guard_profile_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_active_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'not allowed to change role, status, or auth_user_id';
  end if;
  return new;
end;
$$;

revoke all on function guard_profile_privileged_columns() from public;

drop trigger if exists trg_guard_profile_privileged_columns on profiles;
create trigger trg_guard_profile_privileged_columns
  before update on profiles
  for each row execute function guard_profile_privileged_columns();

commit;
