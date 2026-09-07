-- Count active enrolments per class in Postgres instead of in JavaScript.
--
-- countEnrollmentsPerClass() fed the "students per class" chart by reading EVERY active
-- enrolment row in the academy - paging through the PostgREST row cap to stay correct -
-- and then folding them into a Map client-side. The answer is one integer per class; the
-- rows were transferred only to be counted and discarded.
--
-- SECURITY MODEL - deliberately SECURITY INVOKER (no `security definer` clause):
--   The caller sees exactly the enrolments RLS already lets them read, so this grants no
--   reach the equivalent select did not. That matters because the read it replaces is
--   RLS-scoped (createClient, not the admin client): a definer function would silently
--   widen the chart to classes the viewer cannot see. finance_totals (0005) and
--   finance_totals_base (0056) are the same shape - stable SQL aggregates on the 0096
--   authenticated allowlist - so this follows an established precedent rather than
--   opening a new door.
--
-- search_path is pinned per 0077's hardening.

begin;

create or replace function count_active_enrollments_per_class()
returns table (class_id uuid, student_count bigint)
language sql
stable
as $$
  select e.class_id, count(*)::bigint
  from enrollments e
  where e.active = true
  group by e.class_id
$$;

alter function count_active_enrollments_per_class() set search_path = public;

-- Revoke from all three NAMED roles before granting, rather than revoking from PUBLIC and
-- letting the authenticated grant stand: Supabase grants EXECUTE to anon and authenticated
-- as named roles, so `from public` alone removes nothing (that is the C-01 shape 0096
-- closed). Stripping all three first makes the ACL below the whole story.
revoke execute on function count_active_enrollments_per_class() from public, anon, authenticated;
grant execute on function count_active_enrollments_per_class() to authenticated, service_role;

commit;
