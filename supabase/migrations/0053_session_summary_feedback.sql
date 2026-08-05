-- 0053_session_summary_feedback.sql
--
-- Per-session summary + feedback (alongside the class time on class_sessions):
--   summary          - written by the tutor/mentor/admin (optional): what the
--                      session covered. Visible to the student.
--   student_feedback - written by the enrolled student: how the session went.
--                      Visible to staff.
--
-- Both are plain columns on the existing per-session row (class_id, session_date).
-- Reads follow the existing class_sessions_read policy (admin, teachers-of-class,
-- and the enrolled student), so each side sees the other's note. Writes stay in
-- the service, which gates the summary on canManageClass and the feedback on the
-- actor being the class's enrolled student.

begin;

alter table class_sessions
  add column if not exists summary text,
  add column if not exists student_feedback text;

commit;
