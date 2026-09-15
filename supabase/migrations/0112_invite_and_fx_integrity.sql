-- 0112: inviting a user, and re-pricing documents into the base currency, become guarded
-- single steps.
--
-- 1. Inviting a user was an UPSERT on email, then a persona sync in separate writes.
--    The "already exists" check ran first, so two admins adding the same address both passed
--    it: the second upsert overwrote the first's role and setup code (that invite silently
--    died), and the two persona syncs interleaved to leave BOTH global personas active. A
--    failure between the profile and its persona left a pending account with no persona that
--    no one could claim or re-add. The profile is now INSERTED - a taken email is refused, never
--    overwritten - together with its role persona.
--
-- 2. Re-pricing wrote one document at a time from rates read at the start. A failure part-way left
--    some documents on the old rate and some on the new; two recomputes provoked by two quick
--    rate changes could commit in the wrong order, leaving the OLDER rates' figures in place with
--    nothing to show it. The app still prices in TypeScript (currency rounding lives there), but it
--    now reads a VERSION of the pricing inputs - the base currency and every rate - before pricing,
--    and writes all its figures in one statement that refuses when the inputs have moved since.
--    A refused recompute simply runs again on the new inputs.
--
-- Refusal codes: email_taken, fx_source_changed.

begin;

-- ── invite ──────────────────────────────────────────────────────────────────

create or replace function create_invited_profile(
  p_email text,
  p_full_name text,
  p_role user_role,
  p_class_level text,
  p_country text,
  p_phone text,
  p_guardian_name text,
  p_guardian_phone text,
  p_joined_on date,
  p_setup_code_hash text,
  p_setup_code_expires_at timestamptz
) returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
begin
  begin
    insert into profiles (
      email, full_name, role, class_level, country, phone, guardian_name, guardian_phone, joined_on,
      status, setup_code_hash, setup_code_expires_at
    ) values (
      lower(trim(p_email)), p_full_name, p_role, p_class_level, p_country, p_phone, p_guardian_name,
      p_guardian_phone, p_joined_on, 'pending', p_setup_code_hash, p_setup_code_expires_at
    )
    returning * into v_profile;
  exception when unique_violation then
    raise exception 'email_taken';
  end;

  -- The one global persona matching the role (role and persona share their names).
  insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
  values (v_profile.id, p_role::text::persona_name, 'global', null, 'active');

  return v_profile;
end;
$$;

-- ── base-currency re-pricing ────────────────────────────────────────────────

-- A version of everything a document's base-currency figure is priced from.
create or replace function fx_source_version() returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    coalesce((select base_currency from org_settings limit 1), '') || '|' ||
    coalesce((select string_agg(id::text || ':' || currency || ':' || base_currency || ':' || rate::text || ':' || effective_from::text,
                                ',' order by id)
                from exchange_rates), '')
  );
$$;

-- Write priced figures, all in one statement per kind, only if the inputs they were priced
-- from are still current. p_rows: [{kind, id, base_currency, base_total, fx_rate, fx_rate_id}].
-- Returns how many documents were written.
create or replace function apply_fx_conversions(p_version text, p_rows jsonb) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipts integer;
  v_payslips integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('fx:conversions', 0));
  if fx_source_version() <> p_version then
    raise exception 'fx_source_changed';
  end if;

  update receipts d
     set base_currency = x.base_currency, base_total = x.base_total, fx_rate = x.fx_rate, fx_rate_id = x.fx_rate_id
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
         as x(kind text, id uuid, base_currency text, base_total numeric, fx_rate numeric, fx_rate_id uuid)
   where x.kind = 'receipt' and d.id = x.id;
  get diagnostics v_receipts = row_count;

  update payslips d
     set base_currency = x.base_currency, base_total = x.base_total, fx_rate = x.fx_rate, fx_rate_id = x.fx_rate_id
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
         as x(kind text, id uuid, base_currency text, base_total numeric, fx_rate numeric, fx_rate_id uuid)
   where x.kind = 'payslip' and d.id = x.id;
  get diagnostics v_payslips = row_count;

  return v_receipts + v_payslips;
end;
$$;

revoke execute on function create_invited_profile(text, text, user_role, text, text, text, text, text, date, text, timestamptz) from public, anon, authenticated;
grant execute on function create_invited_profile(text, text, user_role, text, text, text, text, text, date, text, timestamptz) to service_role;
revoke execute on function fx_source_version() from public, anon, authenticated;
grant execute on function fx_source_version() to service_role;
revoke execute on function apply_fx_conversions(text, jsonb) from public, anon, authenticated;
grant execute on function apply_fx_conversions(text, jsonb) to service_role;

commit;
