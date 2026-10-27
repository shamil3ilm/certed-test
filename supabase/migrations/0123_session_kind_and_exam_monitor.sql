-- 0123: a session has a TYPE, and an exam can be monitored by someone other than the tutor.
--
-- THE GAP: every recorded session was the same kind of thing. The hours report could say how
-- long a tutor taught a student, but not how much of that was a demo class (a trial, not
-- working time) or an exam (time spent watching a student sit a paper, which may be done by
-- somebody who is not that student's tutor at all). Neither could be recorded, so neither could
-- be reported separately.
--
--   kind        'regular' (default) | 'demo' | 'exam'. NOT NULL with a default, so every existing
--               row becomes 'regular' and every existing report is unchanged by this migration.
--   monitor_id  who monitored an EXAM, when that is not the session's tutor. NULL means the
--               tutor monitored it. Only meaningful for an exam, and the CHECK says so, so a
--               regular or demo session can never carry a stray monitor that a report would
--               then credit with hours.
--
-- NOTHING FINANCIAL CHANGES HERE. Receipts and pay slips are still built from the same
-- recorded windows as before; what a demo or an exam should bill, or pay, is a separate
-- decision. Two consequences are deliberate:
--   * a session marked demo/exam is still summed by the billing draft exactly as a regular one
--     until that decision is made, and
--   * kind is NOT protected by the billed-month lock (0100/0110/0116), which guards the window
--     and the tutor. When billing starts to depend on kind, that lock must cover it too.

begin;

alter table class_sessions
  add column if not exists kind text not null default 'regular',
  add column if not exists monitor_id uuid references profiles (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'class_sessions_kind_check') then
    alter table class_sessions
      add constraint class_sessions_kind_check check (kind in ('regular', 'demo', 'exam'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'class_sessions_monitor_only_for_exam') then
    alter table class_sessions
      add constraint class_sessions_monitor_only_for_exam check (monitor_id is null or kind = 'exam');
  end if;
end $$;

comment on column class_sessions.kind is
  'What kind of session this was: regular (default), demo (a trial class - not working time) or exam. Reports split hours by it; billing does not yet.';
comment on column class_sessions.monitor_id is
  'Who monitored an EXAM when that was not the session''s tutor (tutor_id). NULL = the tutor monitored it. Only set when kind = ''exam''. The monitor is credited with the exam hours as working time.';

-- 0070 replaced the role-wide SELECT with an explicit column list: a column added later is
-- unreadable by `authenticated` until it is listed. A student sees what kind of session they
-- sat (the label on their own attendance row), so kind is granted. monitor_id is NOT: it names
-- a colleague's working time, which is the same reason hours_recorded_by stays off the list.
grant select (kind) on table class_sessions to authenticated;

-- "Exams I monitored" reads by monitor, and nothing indexed it.
create index if not exists class_sessions_monitor_window_idx
  on class_sessions (monitor_id, actual_start)
  where monitor_id is not null;

-- 0101's exclusion constraint stops a tutor being booked into two overlapping sessions. That is
-- right while the tutor is the person IN the session, and wrong for an exam someone else is
-- monitoring: the tutor is not in the room, and being unable to record the student's exam
-- because they were teaching somebody else at the time is precisely the situation this column
-- exists to describe. Recreated with the same key, excluding only an exam monitored by a
-- different person. A monitor may watch several candidates at once, so the monitor is not
-- constrained at all.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'class_sessions_no_tutor_overlap') then
    alter table class_sessions drop constraint class_sessions_no_tutor_overlap;
    alter table class_sessions
      add constraint class_sessions_no_tutor_overlap
      exclude using gist (
        tutor_id with =,
        tstzrange(actual_start, actual_end) with &&
      )
      where (
        tutor_id is not null and actual_start is not null and actual_end is not null
        and (kind <> 'exam' or monitor_id is null or monitor_id = tutor_id)
      );
  else
    raise warning 'class_sessions_no_tutor_overlap was not present (btree_gist unavailable when 0101 ran) - 0123 leaves it absent.';
  end if;
end $$;

commit;
