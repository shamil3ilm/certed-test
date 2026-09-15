-- ============================================================================
-- Cert-Ed Academia - verify a freshly provisioned PRODUCTION database
--
-- Run in the Supabase SQL editor AFTER:
--   PROD-0_prepare_empty_database.sql   (drops the stock public schema)
--   PROD-1_full_rebuild_0001-0106.sql   (the whole chain, in one shot)
--
-- Read only, and it runs top to bottom without erroring on a project whose
-- optional extensions are not installed. Expected results are stated above
-- each query; anything else is a stop.
-- ============================================================================

-- 1. SCHEMA HEAD ------------------------------------------------------------
-- Four markers spread across the chain, so a partial apply cannot pass by
-- accident. EXPECT: all four `t`.
--
-- The function is checked WITH its argument types. to_regproc() on the bare
-- name reports a match for any function of that name, which is how this query
-- came to answer `t` while the call below failed - the real signature is
-- rls_disabled_tables(text[]), not a zero-argument function.
select
  to_regclass('public.guardians')      is not null as has_guardians_0076,
  to_regclass('public.class_sessions') is not null as has_class_sessions,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'class_sessions'
      and column_name  = 'subject_id'
  )                                                as has_session_subject_0104,
  to_regprocedure('public.rls_disabled_tables(text[])') is not null as has_rls_fn_0069;

-- 2. ROW LEVEL SECURITY -----------------------------------------------------
-- Asked of the catalogue directly: no arguments, no privileges, and it cannot
-- disagree with the database. EXPECT: zero rows.
--
-- Every row here is a table that any holder of the anon key can read, which is
-- the public internet. This is the single most consequential query on the page.
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by c.relname;

-- 2b. API ACCESS TO THE SCHEMA ---------------------------------------------
-- The API roles must be able to use schema public at all. Step 1 drops the project's
-- stock schema, taking its grants with it, and the snapshot grants USAGE back. Without
-- it every table and function grant is unreachable and the API refuses every request.
-- EXPECT: three rows, all `t`.
select r as api_role,
       has_schema_privilege(r, 'public', 'USAGE') as can_use_public
from unnest(array['anon', 'authenticated', 'service_role']) as r;

-- 3. RETENTION JOBS ---------------------------------------------------------
-- Guarded, so a project without pg_cron reports a plain `false` instead of
-- stopping the script with "relation cron.job does not exist".
-- EXPECT on Supabase: pg_cron installed = t.
select
  (select count(*) from pg_extension where extname = 'pg_cron') > 0 as pg_cron_installed,
  to_regclass('cron.job') is not null                               as cron_job_readable;

-- The retention schedules from 0051 / 0058 / 0059 / 0101.
--
-- EXPECT ZERO JOBS HERE when provisioning from the rebuild snapshot, and that is not a
-- fault: the snapshot is `pg_dump --schema=public --schema-only`, cron schedules are ROWS
-- IN cron.job rather than DDL in public, and nothing re-emits them. Enabling pg_cron first
-- does not change it - the extension is necessary, but the snapshot never calls
-- cron.schedule. Run 04_retention_jobs.sql, then expect four rows, all active.
--
-- Provisioning from the numbered MIGRATION chain instead does create them, because those
-- four migrations call cron.schedule themselves - inside a guard that skips silently when
-- the extension is absent, which is why pg_cron goes on before the chain.
--
-- Wrapped in a DO block so this file runs clean top to bottom on a project WITHOUT
-- pg_cron: a bare `select ... from cron.job` errors there, and an error at the end of a
-- verification script reads as "the verification broke" rather than "there is nothing to
-- report". The jobs come back as notices - so this file is for psql, which prints them.
-- The dashboard SQL editor discards notices entirely; use the delivered editor copy there.
do $$
declare r record; n int := 0;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is NOT installed - no retention jobs can exist.';
    raise notice 'audit_log, notifications, pending_emails and rate-limit rows will grow without bound.';
    raise notice 'Enable the pg_cron extension, then run 04_retention_jobs.sql.';
    return;
  end if;
  for r in select jobname, schedule, active from cron.job order by jobname loop
    raise notice 'cron job: % | % | active=%', r.jobname, r.schedule, r.active;
    n := n + 1;
  end loop;
  raise notice '% retention job(s) found.', n;
end $$;

-- ============================================================================
-- 4. NEXT (not run here)
--
-- On the FREE plan there are no automated backups, so the compensating control
-- is a scheduled pg_dump held off-project. Verify it the way a real backup is
-- verified - restore it into a scratch database and run:
--
--   PGHOST=... PGUSER=... PGDATABASE=<scratch> bash scripts/restore-drill.sh
--
-- It does not care where the dump came from. Until a dump has been restored
-- once, the backup is a hypothesis.
-- ============================================================================
