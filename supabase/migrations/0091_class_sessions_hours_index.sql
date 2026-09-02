-- 0091_class_sessions_hours_index.sql
-- Index the teaching-hours aggregate read. getClassTutorHours / getAllClassTutorHours /
-- getTutorPersonalHours (src/lib/services/teaching-hours.ts) all run one query shape:
--   select ... from class_sessions where class_id in (...) and actual_start >= $1 and actual_start < $2
-- (grouping by tutor_id happens in memory, so there is no tutor_id predicate to index).
-- The existing class_sessions_class_idx is on (class_id, session_date) - a DIFFERENT column
-- than the actual_start the month window filters on, so it only serves the class_id prefix.
-- Add a (class_id, actual_start) index so a per-class monthly rollup is an index range scan.
--
-- Depends on 0003 (class_sessions.class_id, actual_start).

create index if not exists class_sessions_class_actual_start_idx
  on class_sessions (class_id, actual_start);
