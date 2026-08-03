-- Cross-instance rate limiting for the UNAUTHENTICATED, IP-keyed limiters
-- (self-registration and the public contact form).
--
-- The in-process limiter in src/lib/security/rate-limit.ts keeps its counter per
-- serverless instance, so under load the effective limit is limit x instances -
-- fine for authenticated, user-keyed throttles, but too loose for the two
-- endpoints an anonymous abuser hits. rate_limit_hit() is the atomic
-- check-and-increment the app calls through the service-role client; the counter
-- now holds across every instance.

create table if not exists public.rate_limit_counters (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0
);

-- Service-role only. RLS is enabled with NO policies, so anon/authenticated are
-- denied entirely; the app reaches this table exclusively through the
-- security-definer RPC below (which the table owner runs, bypassing RLS).
alter table public.rate_limit_counters enable row level security;

create or replace function public.rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_started_at timestamptz;
  v_hits integer;
begin
  -- Atomic fixed-window counter: a single upsert both resets an expired window
  -- and increments a live one, so concurrent requests can't race a read/modify.
  insert into public.rate_limit_counters as c (bucket_key, window_started_at, hits)
    values (p_key, v_now, 1)
  on conflict (bucket_key) do update
    set
      window_started_at = case
        when c.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now
        else c.window_started_at
      end,
      hits = case
        when c.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
        else c.hits + 1
      end
  returning c.window_started_at, c.hits into v_window_started_at, v_hits;

  if v_hits > p_limit then
    return query
      select
        false,
        greatest(
          1,
          ceil(extract(epoch from (v_window_started_at + make_interval(secs => p_window_seconds) - v_now)))
        )::integer;
  else
    return query select true, 0;
  end if;
end;
$$;

-- The RPC is the ONLY intended entry point. Deny it to PostgREST's anon/
-- authenticated roles (a callable security-definer function would otherwise let
-- anyone manipulate other clients' counters) and grant it to service_role alone.
revoke all on function public.rate_limit_hit(text, integer, integer) from public;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
