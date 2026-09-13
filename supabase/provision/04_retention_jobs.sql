-- ============================================================================
-- Cert-Ed Academia - create the four retention jobs
--
-- Delivered for the Supabase SQL editor as PROD-3_retention_jobs.sql; the two are
-- the same file. Run AFTER the rebuild snapshot. Safe to re-run - each job is
-- unscheduled before it is scheduled.
-- ============================================================================
--
-- WHY THIS STEP EXISTS AT ALL
-- The rebuild snapshot is `pg_dump --schema=public --schema-only`. Cron schedules are
-- ROWS IN cron.job, not DDL in the public schema, so the dump cannot carry them - the
-- same reason scripts/rebuild-snapshot.sh has to re-emit the org_settings row, the
-- table REVOKEs and the function grants by hand. Nothing re-emits the schedules.
--
-- So a snapshot-provisioned database ends up with NO retention whatsoever while every
-- apply reports success, and enabling pg_cron first does not change that: the extension
-- is necessary but the snapshot never calls cron.schedule. Verified on a real project -
-- a clean apply of the snapshot with pg_cron already installed produced zero jobs.
--
-- WITHOUT THIS STEP: audit_log, read notifications, sent/failed emails and rate-limit
-- counters grow without bound, forever.
--
-- The four schedules are copied from the migrations that own them:
--   0051_notifications_retention.sql        purge-read-notifications
--   0058_pending_emails_queue.sql           purge-sent-emails
--   0059_audit_log_retention.sql            purge-old-audit-log
--   0101_session_integrity_and_retention    purge-expired-rate-limits
-- Keep them in step with those migrations; the migrations remain the source of truth.
-- ============================================================================

do $$
begin
  -- A hard error, not a notice. The dashboard SQL editor DISCARDS notices, so a notice
  -- here would leave "retention is missing" invisible on the one screen where someone is
  -- looking for exactly that.
  if to_regclass('cron.job') is null then
    raise exception
      'pg_cron is not installed. Enable it first (Database -> Extensions -> pg_cron, or: create extension if not exists pg_cron;) and run this file again.';
  end if;

  -- 0051: read notifications past the 90-day window. Daily 03:30 UTC.
  if exists (select 1 from cron.job where jobname = 'purge-read-notifications') then
    perform cron.unschedule('purge-read-notifications');
  end if;
  perform cron.schedule(
    'purge-read-notifications',
    '30 3 * * *',
    $q$ delete from public.notifications where read_at is not null and created_at < now() - interval '90 days' $q$
  );

  -- 0059: audit_log past the 24-month window. Daily 03:45 UTC, staggered after 03:30.
  if exists (select 1 from cron.job where jobname = 'purge-old-audit-log') then
    perform cron.unschedule('purge-old-audit-log');
  end if;
  perform cron.schedule(
    'purge-old-audit-log',
    '45 3 * * *',
    $q$ delete from public.audit_log where created_at < now() - interval '24 months' $q$
  );

  -- 0058: TERMINAL emails only. Pending rows are never removed, so nothing queued is
  -- dropped unsent. Daily 04:00 UTC.
  if exists (select 1 from cron.job where jobname = 'purge-sent-emails') then
    perform cron.unschedule('purge-sent-emails');
  end if;
  perform cron.schedule(
    'purge-sent-emails',
    '0 4 * * *',
    $q$ delete from public.pending_emails where status in ('sent', 'failed') and created_at < now() - interval '7 days' $q$
  );

  -- 0101: expired rate-limit windows. Hourly at :15.
  if exists (select 1 from cron.job where jobname = 'purge-expired-rate-limits') then
    perform cron.unschedule('purge-expired-rate-limits');
  end if;
  perform cron.schedule(
    'purge-expired-rate-limits',
    '15 * * * *',
    $q$ delete from public.rate_limit_counters where window_started_at < now() - interval '1 hour' $q$
  );
end $$;

-- Last statement on purpose: the dashboard shows only the final result set, so this is
-- what you will actually see. EXPECT 4 rows, all active = true.
select jobname, schedule, active
from cron.job
order by jobname;
