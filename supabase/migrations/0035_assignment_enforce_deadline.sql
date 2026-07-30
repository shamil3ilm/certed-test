-- 0035_assignment_enforce_deadline.sql
-- Per-assignment hard-deadline flag. When true, submissions/resubmissions are
-- blocked once the due date has passed (enforced app-side in recordSubmission;
-- the classwork page shows a "closed" state). Default false preserves today's
-- always-accept-late behaviour for existing assignments.
alter table public.assignments
  add column if not exists enforce_deadline boolean not null default false;
