-- 0071: generalize assignments into TYPED classwork.
--
-- An exam/quiz/test is graded work that feeds the report card just like an
-- assignment, but it is usually sat IN PERSON (no online submission) and may run
-- for a time window rather than land on a single due instant. Rather than a second
-- table + a parallel grading/report-card pipeline, an assignment now carries:
--   - type: what kind of classwork it is (the tag);
--   - expects_submission: whether a student submits online (false for a sat exam,
--     so no submit UI and no deadline enforcement apply);
--   - ends_at: the optional END of a timed window (due_date stays the anchor -
--     the deadline for submitted work, or the START instant of a sat exam).
--
-- Additive + idempotent. Existing rows default to type 'assignment', online
-- submission expected, no end - i.e. today's behaviour, unchanged. Depends on 0003
-- (assignments).

alter table assignments
  add column if not exists type text not null default 'assignment'
    check (type in ('assignment', 'exam', 'quiz', 'test', 'project')),
  add column if not exists expects_submission boolean not null default true,
  add column if not exists ends_at timestamptz;

-- Read path filters upcoming exams by type on the dashboard; keep it index-served.
create index if not exists assignments_type_due_idx on assignments (type, due_date);

comment on column assignments.type is
  'The kind of classwork: assignment (default) | exam | quiz | test | project.';
comment on column assignments.expects_submission is
  'Whether a student submits online. false = sat in person; graded directly, no deadline enforcement.';
comment on column assignments.ends_at is
  'Optional END of a timed window (e.g. a 10:00-12:00 exam). due_date is the anchor/start.';
