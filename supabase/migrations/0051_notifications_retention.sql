-- Notification retention: purge READ notifications older than 90 days.
--
-- Policy decision (audit trail is kept indefinitely for compliance; only the
-- notifications feed is trimmed). Unread notifications are preserved regardless
-- of age - a user hasn't seen them yet. Uses pg_cron (available on Supabase).
--
-- pg_cron is NOT present in a bare local Postgres, so `create extension` there
-- would abort `supabase db reset` / scripts/test-rls.sh at this migration. Guard
-- the whole thing in a block that skips (with a notice) when pg_cron can't be
-- installed, so a fresh local reset succeeds; production Supabase installs it and
-- schedules the job as normal. Idempotent: re-running replaces the schedule.

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable (bare local Postgres?) - skipping notification retention schedule';
    return;
  end;

  if exists (select 1 from cron.job where jobname = 'purge-read-notifications') then
    perform cron.unschedule('purge-read-notifications');
  end if;

  -- Daily at 03:30 UTC (off-peak). Deletes read notifications past the 90-day window.
  perform cron.schedule(
    'purge-read-notifications',
    '30 3 * * *',
    $q$ delete from public.notifications where read_at is not null and created_at < now() - interval '90 days' $q$
  );
end $$;
