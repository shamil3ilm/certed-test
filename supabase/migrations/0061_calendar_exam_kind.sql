-- 0061_calendar_exam_kind.sql
-- Adds an 'exam' kind so an exam can be scheduled as a calendar event and shown on
-- the dashboard. Non-destructive and idempotent; existing rows/kinds are untouched.

alter type calendar_event_kind add value if not exists 'exam';
