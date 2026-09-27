-- 0119: the server can run every function in public, and the next one added too.
--
-- service_role is the identity the app's admin client uses. On a Supabase project it holds
-- EXECUTE through the default privileges defined ON THE STOCK public schema - which provisioning
-- drops (supabase/provision/01_prepare_empty_database.sql) so the rebuild's own CREATE SCHEMA can
-- run. Everything created afterwards therefore arrives with no grant for the server at all, and
-- the first page that calls one fails: "permission denied for function finance_totals_base" is
-- what a freshly provisioned production answered on the dashboard.
--
-- The 0096 sweep and the snapshot epilogue both grant per function, splitting them between
-- `authenticated` (the ones RLS policies and CHECK constraints call) and `service_role` (the
-- rest) - so the functions in the first group were never granted to the server. It calls those
-- too: finance_totals_base backs the dashboard totals, replace_own_submission the upload path.
--
-- Nothing here widens what the public or a signed-in user can reach: anon and authenticated are
-- untouched. Extension-owned functions are skipped - they are not ours to grant.

begin;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
      )
  loop
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end $$;

-- And the one after this migration. The matching REVOKE for public/anon/authenticated is 0096's;
-- this is its counterpart, so a function added later is reachable by the server and nobody else.
alter default privileges in schema public grant execute on functions to service_role;

commit;
