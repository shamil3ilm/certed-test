-- Audit-log retention: purge audit_log rows older than 24 months.
--
-- Policy decision. Migration 0051 kept the audit trail indefinitely; this sets an
-- explicit 24-month horizon - a common retention period for an education provider,
-- and long enough to cover a full academic cycle plus a year of look-back. Bounding
-- it keeps the table (the largest by row count, ~25 MB/yr) from growing without end
-- on the Free tier. Trimmed daily rather than archived: at this scale cold-storage
-- export would cost more than the rows are worth; revisit if a longer legal hold is
-- ever required.
--
-- pg_cron is NOT present in a bare local Postgres, so `create extension` there would
-- abort `supabase db reset` / scripts/test-rls.sh at this migration. Guard the whole
-- thing in a block that skips (with a notice) when pg_cron can't be installed, so a
-- fresh local reset succeeds; production Supabase installs it and schedules the job
-- as normal. Idempotent: re-running replaces the schedule.

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable (bare local Postgres?) - skipping audit-log retention schedule';
    return;
  end;

  if exists (select 1 from cron.job where jobname = 'purge-old-audit-log') then
    perform cron.unschedule('purge-old-audit-log');
  end if;

  -- Daily at 03:45 UTC (off-peak, staggered after the 03:30 notifications purge).
  -- Deletes audit_log rows past the 24-month window.
  perform cron.schedule(
    'purge-old-audit-log',
    '45 3 * * *',
    $q$ delete from public.audit_log where created_at < now() - interval '24 months' $q$
  );
end $$;
