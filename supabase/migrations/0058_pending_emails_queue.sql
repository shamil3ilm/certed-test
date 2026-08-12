-- Email delivery queue: move notification email fan-out OFF the request path.
--
-- Before this, notify() awaited N Resend HTTP calls inline, so a 30-recipient
-- announcement stalled the request and shed sends against Resend's rate limit.
-- Now notify() enqueues one already-rendered row per recipient here and returns;
-- a scheduled drain (see the note at the bottom) sends them in the background.

create table if not exists pending_emails (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null,
  subject    text not null,
  html       text not null,
  status     text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts   int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

-- The drain reads the oldest pending rows first; a partial index keeps that scan
-- tiny as sent rows accumulate between purges.
create index if not exists pending_emails_drain_idx on pending_emails (created_at) where status = 'pending';

alter table pending_emails enable row level security;
-- No policy, on purpose: the queue is server-only. The app enqueues and drains
-- with the service-role client (which bypasses RLS); no anon/authenticated caller
-- may read recipients or message bodies.

-- Retention: drop sent/failed rows after 7 days so the queue table stays small.
-- Mirrors the pg_cron pattern in 0051, and is skipped on a bare local Postgres
-- that has no pg_cron (so `supabase db reset` / test-rls still apply cleanly).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable (bare local Postgres?) - skipping pending_emails purge schedule';
    return;
  end;

  if exists (select 1 from cron.job where jobname = 'purge-sent-emails') then
    perform cron.unschedule('purge-sent-emails');
  end if;

  -- Daily at 04:00 UTC. Only terminal rows (sent/failed) are removed; pending
  -- rows are always kept so nothing queued is ever dropped unsent.
  perform cron.schedule(
    'purge-sent-emails',
    '0 4 * * *',
    $q$ delete from public.pending_emails where status in ('sent', 'failed') and created_at < now() - interval '7 days' $q$
  );
end $$;

-- ---------------------------------------------------------------------------
-- Scheduling the DRAIN (send step) - do this once per environment, with your
-- deployed values. The drain itself is an app route (GET /api/cron/drain-emails,
-- guarded by CRON_SECRET) because sending goes through Resend, which SQL cannot
-- call. Two equivalent options:
--
--   A. Vercel Cron (needs the Pro plan for sub-daily frequency): add to
--      vercel.json ->  { "path": "/api/cron/drain-emails", "schedule": "*/5 * * * *" }
--
--   B. pg_cron + pg_net (plan-independent), run once with your URL + secret:
--        create extension if not exists pg_net;
--        select cron.schedule('drain-emails', '* * * * *', $q$
--          select net.http_post(
--            url     := 'https://app.certedacademia.com/api/cron/drain-emails',
--            headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--          );
--        $q$);
-- ---------------------------------------------------------------------------
