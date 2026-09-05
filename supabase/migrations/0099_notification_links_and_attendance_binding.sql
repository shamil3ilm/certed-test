-- 0099: restore the notification channel (C-07) and bind attendance to its session (C-04).

-- ── C-07: every notification insert has been failing since 0090 ───────────────
-- 0090 added `check (is_http_link(link))` to notifications, and is_http_link accepts only
-- NULL, '#', or ^https?://. But every link the app writes is APP-RELATIVE - '/calendar',
-- '/classroom/<id>', '/classroom/<id>/classwork#materials' - so the CHECK rejects them all.
-- The fan-out runs through notifyBestEffort, which logs and swallows, so the channel has
-- been dead silently: no in-app notification has been delivered since that migration.
--
-- The constraint's real job is to keep `javascript:` and `data:` out of an href. A
-- same-origin path cannot carry a scheme, so it is safe - but a PROTOCOL-relative '//evil'
-- is not: the browser reads it as a foreign origin, so it stays excluded.
create or replace function is_app_link(link text) returns boolean
language sql immutable set search_path = public as $$
  select link is null
      or link = '#'
      or link ~* '^https?://'
      or (link ~ '^/' and link !~ '^//')
$$;

-- 0096 closed the default privilege for new functions, so grant explicitly. A CHECK
-- evaluates as the WRITING role, hence both (mirrors 0084's note for is_http_link).
revoke execute on function is_app_link(text) from public, anon, authenticated;
grant execute on function is_app_link(text) to authenticated, service_role;

alter table notifications drop constraint if exists notifications_link_scheme;
alter table notifications add constraint notifications_link_scheme check (is_app_link(link));

-- ── C-04: attendance.session_id was unbound from class_id / session_date ──────
-- 0094 made session_id NOT NULL and 0095 made attendance-by-session the money input, but
-- the column carried only a bare FK to class_sessions(id). teaching-hours resolves the
-- CLASS FROM THE SESSION, so a mark could point at a session of a different class and
-- those minutes would flow into a receipt. marking.ts checks this in application code,
-- which a direct PostgREST write bypasses.
--
-- Bind it in the schema instead: a composite FK can only reference a UNIQUE key, so add
-- one on the three columns first. (id alone is still the primary key; this is an
-- additional key, not a replacement, and it is trivially satisfied by existing rows.)
alter table class_sessions
  drop constraint if exists class_sessions_id_class_id_session_date_key;
alter table class_sessions
  add constraint class_sessions_id_class_id_session_date_key unique (id, class_id, session_date);

-- Repoint the FK at all three columns, so a mark can only belong to a session of the
-- same class on the same date. Existing rows already satisfy it (0094 backfilled
-- session_id from the matching class_id + session_date), so this validates as-is.
alter table attendance drop constraint if exists attendance_session_id_fkey;
alter table attendance
  add constraint attendance_session_id_fkey
  foreign key (session_id, class_id, session_date)
  references class_sessions (id, class_id, session_date)
  on delete cascade;

-- ── C-04 (second half): attendance had no grants and no epilogue revoke ───────
-- so `authenticated` still held Supabase's table-wide default write. Every attendance
-- WRITE in the app goes through the service-role client (upsert on marking, delete on
-- clearing a session, the join-time update); the user client only ever SELECTs. So the
-- write grants are pure attack surface - a student could PostgREST their own marks.
-- The RLS policies stay as the second gate for anything that is granted later.
revoke insert, update, delete on table attendance from anon, authenticated;

-- ── Align the class_sessions INSERT grant with the policy that no longer exists ──
-- 0096 restored the column grants 0068 intended, including
-- `insert (class_id, session_date, student_feedback)` for a student creating their own
-- feedback row. 0097 then dropped class_sessions_student_feedback_insert - the only policy
-- that admitted a student to INSERT - because a student-created row has actual_start NULL
-- and resolveMarkingSession orders NULLS FIRST, so the tutor's roster marking attached to a
-- 0-minute session and the student's billed hours collapsed (C-10).
--
-- The grant is therefore inert today: RLS refuses the insert regardless. Drop it anyway.
-- A privilege that outlives its policy is a loaded gun pointing at the next person who adds
-- an INSERT policy here - it would silently re-arm C-10 with no review of the grant.
-- UPDATE (student_feedback) stays: class_sessions_student_feedback_update is still live.
revoke insert (class_id, session_date, student_feedback) on table class_sessions from authenticated;
