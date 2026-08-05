-- 0052_one_active_student_per_class.sql
--
-- Business rule: a class is one-to-one. It has at most ONE active student; a
-- student takes several classes (one per tutor/subject), and a tutor teaches a
-- single student per class. This adds the DB guarantee behind the service check
-- in src/lib/services/enrollments.ts, so a race or a direct write can't create a
-- two-student class.

begin;

-- Resolve any pre-existing multi-student classes before adding the constraint:
-- keep the EARLIEST active enrollment per class and deactivate the rest (they are
-- kept as inactive rows, re-enrollable into a class of their own). No-op when the
-- data is already one-to-one.
with ranked as (
  select id, row_number() over (partition by class_id order by created_at, id) as rn
  from enrollments
  where active
)
update enrollments e
set active = false
from ranked r
where e.id = r.id and r.rn > 1;

-- At most one ACTIVE enrollment per class. Partial index so INACTIVE history
-- (re-enrollable rows) is unconstrained.
create unique index if not exists enrollments_one_active_student_per_class
  on enrollments (class_id)
  where active;

commit;
