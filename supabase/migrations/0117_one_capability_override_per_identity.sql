-- 0117: one capability override per person, capability and scope.
--
-- uq_capability_overrides_identity included `effect`, so one person could hold both an allow and a
-- deny for the same capability. set_global_capability_override (0108) replaces the row under a
-- lock and never writes both, but the table's policies let an admin insert directly through
-- PostgREST, and a pair written that way contradicts itself: resolveCapabilities lets the deny win,
-- and the allow sits in the table with no effect.
--
-- Existing duplicates are reduced to the row that decides the outcome today, so nobody's effective
-- capabilities change: an active row over an inactive one (only active rows are read), then a deny
-- over an allow (deny wins), then the most recently updated.

begin;

delete from capability_overrides o
 using (
   select id,
          row_number() over (
            partition by profile_id, capability, scope_type, coalesce(scope_id::text, 'global')
            order by (status = 'active') desc, (effect = 'deny') desc, updated_at desc, created_at desc, id desc
          ) as position
     from capability_overrides
 ) ranked
 where o.id = ranked.id
   and ranked.position > 1;

drop index if exists uq_capability_overrides_identity;
create unique index uq_capability_overrides_identity
  on capability_overrides (profile_id, capability, scope_type, coalesce(scope_id::text, 'global'));

commit;
