-- 0094_attendance_per_session.sql
-- Attach each attendance mark to the SESSION it belongs to, so a student can be marked
-- separately for each session of a day.
--
-- THE GAP: attendance was uniquely keyed (class_id, student_id, session_date) - one mark
-- per student per DAY. 0093 let a class hold several sessions in a day, so a student who
-- attended the morning session but missed the afternoon one could not be recorded as both:
-- the second mark overwrote the first, exactly like the session rows before 0093.
--
-- THE MODEL: a mark now belongs to a session (`session_id`, NOT NULL), and the uniqueness
-- is (session_id, student_id). class_id and session_date are DELIBERATELY KEPT:
--   * every attendance RLS policy gates on class_id / student_id, so they continue to work
--     untouched - this migration changes no policy;
--   * 0077's class_sessions student-feedback policy joins attendance on
--     (class_id, student_id, session_date);
--   * the per-day reads (history, rates, dashboards) stay index-friendly.
-- They are now derived facts about the mark's session rather than its identity.
--
-- ON DELETE CASCADE: a mark belongs to its session, so removing a session removes the marks
-- recorded against it. That is the intended semantics - the alternative (orphaned marks)
-- would leave attendance for a session nobody can see.
--
-- BACKFILL: attendance may exist for a day with no recorded session (marking has never
-- required recording times). Those days get a session row with no times - honest about what
-- is known, and consistent with how a student's feedback already creates a timeless session.
-- A timeless session contributes zero teaching minutes, so no total changes.
--
-- Idempotent. Depends on 0008 (attendance), 0047 (class_sessions), 0093.

alter table attendance add column if not exists session_id uuid;

-- 1) Every attendance day must have a session to attach to.
insert into class_sessions (class_id, session_date)
select distinct a.class_id, a.session_date
  from attendance a
 where not exists (
   select 1 from class_sessions cs
    where cs.class_id = a.class_id and cs.session_date = a.session_date
 );

-- 2) Attach each mark to that day's FIRST session (deterministic: earliest recorded start,
--    then oldest row). Before 0093 there was at most one session per class per day, so for
--    existing data this is an exact mapping.
update attendance a
   set session_id = (
     select cs.id
       from class_sessions cs
      where cs.class_id = a.class_id
        and cs.session_date = a.session_date
      order by cs.actual_start asc nulls first, cs.created_at asc
      limit 1
   )
 where a.session_id is null;

-- 3) Enforce the new shape.
alter table attendance alter column session_id set not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_session_id_fkey'
  ) then
    alter table attendance
      add constraint attendance_session_id_fkey
      foreign key (session_id) references class_sessions (id) on delete cascade;
  end if;
end $$;

alter table attendance
  drop constraint if exists attendance_class_id_student_id_session_date_key;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_session_id_student_id_key'
  ) then
    alter table attendance
      add constraint attendance_session_id_student_id_key unique (session_id, student_id);
  end if;
end $$;

create index if not exists attendance_session_idx on attendance (session_id);

comment on column attendance.session_id is
  'The session this mark belongs to. A student is marked once per SESSION, not once per day; class_id and session_date are retained because the RLS policies and per-day reads use them.';
