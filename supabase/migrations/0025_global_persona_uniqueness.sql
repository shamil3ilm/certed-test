-- Migration 0025: enforce one global persona row per (profile_id, persona_name).
--
-- Why: the table's UNIQUE(profile_id, persona_name, scope_id) constraint (0014)
-- does NOT constrain global personas. scope_id is NULL for a global persona, and
-- Postgres treats every NULL as DISTINCT in a unique constraint - so the
-- constraint never fires for global rows, and the app's ON CONFLICT upsert kept
-- inserting a fresh duplicate on every revoke/restore and role-flip instead of
-- reactivating the existing row. The app code now reactivates-then-inserts, but
-- without a DB backstop two concurrent calls could still both insert.
--
-- This migration (1) collapses any duplicate global rows that already
-- accumulated, keeping a single canonical row per pair, then (2) adds a partial
-- unique index so the duplicate can never recur.
--
-- Idempotent: the de-dupe is a no-op once collapsed, and the index uses
-- IF NOT EXISTS. Safe to re-run.

begin;

-- (1) Collapse existing duplicates. For each (profile_id, persona_name) global
--     group, keep ONE row - prefer an active row, then the earliest-created -
--     and delete the rest. Keeping the earliest-created row preserves the
--     original grant timestamp.
with ranked as (
  select
    id,
    row_number() over (
      partition by profile_id, persona_name
      order by (status = 'active') desc, assigned_at asc, id asc
    ) as rn
  from persona_assignments
  where scope_type = 'global'
)
delete from persona_assignments pa
using ranked
where pa.id = ranked.id
  and ranked.rn > 1;

-- (2) Make the collapse permanent: one global persona row per (profile, name).
create unique index if not exists persona_assignments_global_unique
  on persona_assignments (profile_id, persona_name)
  where scope_type = 'global';

commit;
