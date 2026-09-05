-- 0093_multiple_sessions_per_day.sql
-- Let a class hold MORE THAN ONE recorded session on the same calendar day.
--
-- THE BUG: 0047 added `unique (class_id, session_date)` to class_sessions, and the write
-- path upserts on that key. Recording a second session for the same class on the same day
-- therefore OVERWROTE the first instead of storing a new record. Consequences reported
-- from staging:
--   * the session list showed only the most recent entry for that class/day;
--   * monthly teaching hours summed a single surviving row, so a tutor who taught three
--     hours across three sessions was credited with only the last one.
-- The hours aggregation itself was already correct (it groups by class + tutor and sums);
-- it simply had one row to add up.
--
-- THE FIX: drop the uniqueness. `id` (the primary key) is already the per-session
-- identifier, so every recorded session becomes its own row and nothing is replaced.
-- The lookup index class_sessions_class_idx (class_id, session_date desc), also from 0047,
-- is NOT unique and stays - so per-class/per-day reads keep their index.
--
-- ATTENDANCE IS UNCHANGED. attendance stays keyed on (class_id, student_id, session_date):
-- marking a student present is a per-DAY fact, not a per-session one. A day's sessions all
-- reference the same attendance row, which is why the session list shows one student-entry
-- time per day. Re-keying attendance per session would be a much larger change and is not
-- needed for per-session hours.
--
-- Idempotent: the constraint is dropped only if present.
--
-- Depends on 0047 (which created the constraint and the index).

alter table class_sessions
  drop constraint if exists class_sessions_class_id_session_date_key;

-- Belt and braces: 0047 wrote the constraint inline, so on some databases it may exist
-- under the index name instead. Dropping a UNIQUE INDEX that backs no constraint is safe.
drop index if exists class_sessions_class_id_session_date_key;

-- Keep the non-unique lookup path explicit, in case an older database never got 0047's
-- index (it is created there with `if not exists`, so this is a no-op on a current DB).
create index if not exists class_sessions_class_idx
  on class_sessions (class_id, session_date desc);

comment on table class_sessions is
  'One row per RECORDED session. A class may have several on the same date; id is the session identifier. Attendance remains per (class, student, date).';
