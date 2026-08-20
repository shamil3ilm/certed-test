-- 0069_rls_health_check.sql
-- A read-only helper for the queue/schema-health cron: reports which of the given
-- public tables have row-level security DISABLED. A security-critical table that was
-- hand-created or altered without RLS (the one way the fail-closed download design
-- could become fail-open) is then observable via a logged alarm rather than silent.
-- SECURITY DEFINER to read pg_class; execute is service-role only.

begin;

create or replace function public.rls_disabled_tables(p_tables text[])
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(c.relname order by c.relname), array[]::text[])
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname = any(p_tables)
    and c.relrowsecurity = false;
$$;

revoke all on function public.rls_disabled_tables(text[]) from public, anon, authenticated;
grant execute on function public.rls_disabled_tables(text[]) to service_role;

commit;
