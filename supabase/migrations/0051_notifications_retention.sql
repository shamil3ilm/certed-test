-- Notification retention (FIND-26): purge READ notifications older than 90 days.
--
-- Policy decision (audit trail is kept indefinitely for compliance; only the
-- notifications feed is trimmed). Unread notifications are preserved regardless
-- of age - a user hasn't seen them yet. Uses pg_cron (available on Supabase);
-- re-running this migration replaces the existing schedule.

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-read-notifications') then
    perform cron.unschedule('purge-read-notifications');
  end if;
end $$;

-- Daily at 03:30 UTC (off-peak). Deletes read notifications past the 90-day window.
select cron.schedule(
  'purge-read-notifications',
  '30 3 * * *',
  $$ delete from public.notifications where read_at is not null and created_at < now() - interval '90 days' $$
);
