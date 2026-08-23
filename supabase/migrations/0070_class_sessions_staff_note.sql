-- 0070_class_sessions_staff_note.sql
-- A staff-private session note, NOT shared with the student.
--
-- WHY the column grant: class_sessions rows are SELECT-able by the enrolled student
-- (policy class_sessions_read uses is_enrolled), so a plain new column would be
-- readable by the student directly via PostgREST (select=staff_note). We add staff_note
-- and then withhold it from the authenticated SELECT grant by replacing the role-wide
-- grant with an explicit column list that omits it. Students AND tutors therefore
-- cannot read staff_note through their RLS client; staff read/write it only via the
-- service role (the canManageClass-gated session save + the manager attendance
-- page-data), the same server-only posture org_settings uses for its sensitive fields.
-- Row scope is unchanged (the class_sessions_read / _write policies still apply).

begin;

alter table class_sessions add column if not exists staff_note text;

-- Replace the role-wide SELECT with an explicit column list that OMITS staff_note.
-- Fail-closed: a column added later is unreadable by authenticated until listed here.
revoke select on table class_sessions from authenticated;
grant select (
  id, class_id, session_date,
  scheduled_start, scheduled_end, actual_start, actual_end,
  tutor_id, tutor_join_at, tutor_leave_at,
  created_at, updated_at,
  summary, student_feedback
) on table class_sessions to authenticated;

commit;
