-- 0103: sum document downloads in Postgres instead of in JavaScript.
--
-- sumResourceDownloads paged EVERY active resource row out of the database and reduced
-- them in the app - O(documents) rows over the wire to produce a single integer, growing
-- forever. Postgres can answer it without moving any of them.
--
-- Deliberately only the SUM. The same analytics module also reads every session and every
-- attendance row all-time; bounding those to a term changes WHAT THE NUMBER MEANS to the
-- person reading the dashboard ("total sessions held" becoming "sessions this term"), so
-- that is a product decision, not a refactor, and is left alone here. This one is a pure
-- efficiency change: the figure is identical, only the work moves.
create or replace function public.sum_active_resource_downloads() returns bigint
    language sql stable security definer
    set search_path to 'public'
    as $$
  select coalesce(sum(download_count), 0)::bigint
  from resources
  where status = 'active'
$$;

comment on function public.sum_active_resource_downloads() is
  'Total downloads across active documents. Service-role only: it is an academy-wide '
  'aggregate for the admin dashboard, not scoped to any caller.';

-- 0096 closed the default privilege, so a new function arrives with no grants at all -
-- state them. Service-role only: this is an admin-dashboard aggregate over every document,
-- and it is SECURITY DEFINER with no authorization of its own, so the grant IS the control.
revoke execute on function public.sum_active_resource_downloads() from public, anon, authenticated;
grant execute on function public.sum_active_resource_downloads() to service_role;
