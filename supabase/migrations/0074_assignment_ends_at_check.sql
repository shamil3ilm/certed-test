-- 0074: enforce the exam time window (ends_at) in the DATABASE, not just app code.
--
-- validateCreateAssignmentInput already rejects ends_at <= due_date, but a tutor
-- holds a live session + the publishable key and can INSERT/UPDATE `assignments`
-- straight through PostgREST (the assignments_insert / assignments_update RLS grant
-- teaches_class) - bypassing that check. This is the same direct-write threat model
-- 0067 acknowledges for submissions. A CHECK closes it. Depends on 0071 (ends_at).
--
-- Existing rows all have ends_at NULL (the column was just added in 0071), so the
-- constraint validates immediately. Idempotent via the pg_constraint guard.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_ends_after_start') then
    alter table assignments
      add constraint assignments_ends_after_start check (ends_at is null or ends_at > due_date);
  end if;
end $$;
