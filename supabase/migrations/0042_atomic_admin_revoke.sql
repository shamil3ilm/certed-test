-- 0042: make account revocation atomic with respect to the "last active admin"
-- guard. revokeUser() used to check count(active admins) and then flip the
-- target's status in two separate statements. Under READ COMMITTED two
-- concurrent revokes of two DIFFERENT admins each read count = 2 (neither sees
-- the other's uncommitted change, and row locks don't help because the writes
-- touch different rows), both pass the `> 1` guard, and both disable -> zero
-- active admins = permanent lockout. Fold the check and the flip into one
-- function under an advisory lock so every admin-tier revocation serializes
-- (same pattern as replace_own_submission, 0012).

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
  -- Serialize every admin-tier revocation on one constant key, so the
  -- last-admin count and the status flip are a single atomic step across rows.
  perform pg_advisory_xact_lock(hashtextextended('profiles:admin-tier-guard'::text, 0));

  select role, status into v_role, v_status from profiles where id = p_target;
  if not found then
    return 'not_found';
  end if;

  -- Only an ACTIVE admin counts toward the tier; an already-disabled target is
  -- a harmless no-op (mirrors the old isLastActiveAdmin, which returned false
  -- for any target that was not an active admin).
  if v_role = 'admin' and v_status = 'active' then
    select count(*) into v_active_admins
    from profiles
    where role = 'admin' and status = 'active';
    if v_active_admins <= 1 then
      return 'last_admin';
    end if;
  end if;

  update profiles set status = 'disabled' where id = p_target;
  return 'ok';
end;
$$;

-- Admin-only RPC, invoked solely via the service-role admin client
-- (createAdminClient). 0034 made PUBLIC execute denied by default for new
-- functions, so an explicit service_role grant is required or the call fails.
revoke execute on function revoke_profile_guarded(uuid) from public, anon, authenticated;
grant  execute on function revoke_profile_guarded(uuid) to service_role;
