-- 0075: migrate legacy exam calendar_events into typed exam assignments.
--
-- Before 0071, an exam was a calendar_events row of kind 'exam'. Exams are now typed
-- assignments (graded, feed the report card), and the dashboard "Upcoming exams"
-- widget reads assignments - so a legacy exam event would still render on the calendar
-- but vanish from that widget. This converts each CLASS-SCOPED legacy exam event into
-- an exam assignment and removes the source event (so it isn't shown twice).
--
-- ACADEMY-WIDE exam events (class_id IS NULL) are LEFT AS-IS: an assignment must
-- belong to a class, so they can't be converted. They remain calendar-only.
--
-- max_marks is left NULL (the legacy event carried no marks); a tutor sets it when
-- grading. due_date/ends_at are the event's wall-clock date+time resolved through the
-- institute timezone. Idempotent: after the DELETE no class-scoped exam event remains.
--
-- PREVIEW BEFORE RUNNING:
--   select count(*) from calendar_events where kind = 'exam' and class_id is not null;
--
-- Depends on 0071 (assignments.type/expects_submission/ends_at), 0004 (calendar_events).

begin;

insert into assignments (
  class_id, title, description, due_date, ends_at,
  type, expects_submission, max_marks, status, created_by, created_at
)
select
  ce.class_id,
  ce.title,
  ce.description,
  (ce.event_date + coalesce(ce.start_time, time '00:00')) at time zone os.timezone,
  case when ce.end_time is not null then (ce.event_date + ce.end_time) at time zone os.timezone end,
  'exam',
  false,
  null,
  'active',
  ce.created_by,
  ce.created_at
from calendar_events ce
cross join org_settings os
where ce.kind = 'exam'
  and ce.class_id is not null;

delete from calendar_events
where kind = 'exam'
  and class_id is not null;

commit;
