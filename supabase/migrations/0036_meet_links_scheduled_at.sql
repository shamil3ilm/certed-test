-- 0036_meet_links_scheduled_at.sql
-- Optional scheduled start time for a meeting link, so students can see WHEN a
-- class is and old meets can expire/lock. Nullable: a link with no time is
-- "always available" (today's behaviour); a scheduled one shows its time and the
-- Join button locks once it has ended (computed in the UI, no auto-delete).
alter table public.meet_links
  add column if not exists scheduled_at timestamptz;
