-- Migration 0032: re-derive submission lateness whenever an assignment's
--                 due_date changes, at the database level, on EVERY write path.
--
-- Why: migration 0026 (edit_assignment_and_reclassify) re-stamps a submission's
-- on-time/late verdict when a deadline moves, but ONLY when the edit is made
-- through that RPC. The assignments_update RLS policy (0003) grants a plain
-- UPDATE to any teaches_class(class_id) tutor, and the browser talks to
-- PostgREST directly with the anon key + JWT. A tutor can therefore send
--   PATCH /rest/v1/assignments?id=eq.<their-class-assignment> {"due_date": ...}
-- which RLS permits: the deadline moves while every submission keeps a verdict
-- computed against the OLD deadline (now-on-time work still reading 'late', or
-- vice versa), feeding wrong statuses into grading and report views. The atomic
-- RPC was written to protect exactly this invariant, but it is bypassable at the
-- real trust boundary. trg_submission_status (0009) only fires BEFORE INSERT on
-- submissions, so it does not cover a later deadline move either.
--
-- Fix: a trigger on assignments UPDATE OF due_date that re-derives every affected
-- submission's status in the SAME transaction as the assignment write. Because it
-- lives in the database, it holds for every write path - the RPC, a direct
-- PostgREST PATCH, an admin edit, or any future code - closing the gap at the
-- boundary itself rather than in one code path. The verdict rule matches
-- set_submission_status() (0009) and edit_assignment_and_reclassify (0026):
-- submitted AFTER the due instant is 'late', at-or-before is 'submitted'.
--
-- SECURITY DEFINER so the submission re-stamp runs with the table owner's rights
-- (RLS-exempt), mirroring the sibling DEFINER functions - the tutor issuing the
-- assignment UPDATE need not hold write access to the submissions being
-- corrected. Idempotent: only rows whose verdict actually changes are written,
-- and re-running is a plain UPDATE. It does not recurse (it writes submissions,
-- not assignments). With this in place the RPC's own submission UPDATE (0026)
-- becomes belt-and-suspenders - both derive the same verdict, so the second runs
-- as a no-op - and it is left untouched so the atomic path keeps working against
-- a database where this trigger has not been applied yet.

create or replace function reclassify_submissions_on_due_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.due_date is distinct from old.due_date then
    update submissions set
      status = case when submitted_at > new.due_date then 'late' else 'submitted' end
    where assignment_id = new.id
      and status <> (case when submitted_at > new.due_date then 'late' else 'submitted' end);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reclassify_on_due_change on assignments;
create trigger trg_reclassify_on_due_change
  after update of due_date on assignments
  for each row execute function reclassify_submissions_on_due_change();
