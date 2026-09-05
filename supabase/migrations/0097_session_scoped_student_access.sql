-- 0097_session_scoped_student_access.sql
-- Re-key the student's class_sessions access from the DATE to the SESSION.
--
-- THE GAP: 0085 gave students read access to "a session they attended" by joining
-- attendance on (class_id, session_date) - correct while a class held at most one session
-- per date. 0093 allowed several sessions a day and 0094 moved each attendance mark onto
-- its own session, but these policies were left on the date key. The effect is that a
-- student who attended the MORNING session of a two-session day can:
--   * READ the afternoon session they never attended (its summary and feedback), and
--   * WRITE student_feedback onto it.
-- Proved on a scratch database: with marks on the morning only, the afternoon row was
-- readable (1 row, expected 0) and a feedback UPDATE against it affected 1 row.
--
-- It is bounded - same class, same day, an enrolled student, never cross-tenant - but it
-- is strictly wider than 0085 intended, and R-05 in scripts/test-rls.sh asserts exactly
-- the invariant it breaks. That assertion still passes only because the fixture puts its
-- two sessions on DIFFERENT dates, so the multi-session day has no coverage at all.
--
-- THE FIX: join on a.session_id = class_sessions.id. That is the key the data now has, and
-- it needs no date comparison at all.
--
-- WHY THE STUDENT INSERT POLICY IS DROPPED, NOT RE-KEYED
--   0068 let a student INSERT a feedback-only class_sessions row for a date the tutor had
--   not recorded yet. Since 0094 that case cannot arise: attendance.session_id is NOT NULL
--   with a cascading FK, so a mark can only exist against a session that exists. Wherever
--   the app's guard (the student attended this date) passes, a session row is already
--   there for the UPDATE to find. Re-keying the policy on session_id would make it
--   unsatisfiable anyway - the row being inserted has no attendance pointing at it - so
--   the honest move is to withdraw a permission the student no longer needs.
--
-- The feedback UI is unchanged: it still offers ONE box per attended DAY. The day-scoped
-- UPDATE it issues now lands only on the sessions RLS admits, i.e. the ones the student
-- actually attended, instead of on every session that date.
--
-- Depends on 0085 (the read policy), 0068/0077 (the feedback policies), 0094 (session_id).

begin;

-- ---------------------------------------------------------------------------
-- 1. Read: only the sessions this student was marked for.
-- ---------------------------------------------------------------------------

drop policy if exists class_sessions_read on class_sessions;
create policy class_sessions_read on class_sessions for select using (
  is_active_admin()
  or teaches_class(class_id)
  or exists (
    select 1
    from attendance a
    join profiles p on p.id = a.student_id
    where a.session_id = class_sessions.id
      and p.auth_user_id = auth.uid()
      and p.status = 'active'
  )
);

comment on policy class_sessions_read on class_sessions is
  'Admins and the class''s teaching staff read every session; a student reads only the sessions they were MARKED for (attendance.session_id), not every session on a date they attended something.';

-- ---------------------------------------------------------------------------
-- 2. Feedback write: same scope.
-- ---------------------------------------------------------------------------

drop policy if exists class_sessions_student_feedback_update on class_sessions;
create policy class_sessions_student_feedback_update on class_sessions for update to authenticated
using (
  is_enrolled(class_id)
  and exists (
    select 1 from attendance a
    where a.session_id = class_sessions.id
      and a.student_id = current_profile_id()
  )
)
with check (
  is_enrolled(class_id)
  and exists (
    select 1 from attendance a
    where a.session_id = class_sessions.id
      and a.student_id = current_profile_id()
  )
);

comment on policy class_sessions_student_feedback_update on class_sessions is
  'A student may write feedback only on a session they were marked for. Column access is separately restricted to student_feedback (0068), so this cannot touch a summary or a staff note.';

-- The student INSERT path is unreachable since 0094 (see the header); withdraw it.
drop policy if exists class_sessions_student_feedback_insert on class_sessions;

-- ---------------------------------------------------------------------------
-- 3. Correct a table comment 0094 left behind.
-- ---------------------------------------------------------------------------
-- 0093 set this comment while attendance was still per day, and 0094 moved marks onto
-- sessions without revisiting it - so the LIVE schema documents the opposite of what it
-- does. A comment shipped in the database is read by whoever inspects it next.
comment on table class_sessions is
  'One row per RECORDED session. A class may have several on the same date; id is the session identifier. Attendance is per SESSION (attendance.session_id), not per date.';

commit;
