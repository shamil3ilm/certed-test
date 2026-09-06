-- 0102: record WHO entered a session's hours (C-06, the half 0100 could not close).
--
-- THE GAP: pay is sum(actual_end - actual_start) grouped by tutor_id, and a tutor records
-- their own sessions. 0100 froze those hours once a live pay slip billed them, which stops
-- editing after payment - but nothing stopped the payee being the only person who ever
-- attested the figure, because class_sessions records only tutor_id (WHO IS PAID) and has
-- no column for WHO ENTERED IT. The two are indistinguishable in the data, so no report,
-- policy or reviewer could tell a tutor's self-recorded month from an admin-recorded one.
--
-- WHY THIS AND NOT A HARD CONTROL: requiring a non-payee to confirm every session is a
-- workflow with a UI, an approval state and a backlog, and imposing it now would stop
-- every unconfirmed hour from billing - breaking payroll to fix a visibility problem.
-- Recording the fact is the prerequisite for any such rule and is useful immediately:
-- issuance is already admin-only, so the admin IS the second party, and showing them which
-- hours nobody but the payee has attested turns that existing human step into a real check.
--
-- Nullable and unbackfilled ON PURPOSE. Existing rows genuinely have no attestation on
-- record, and inventing one - stamping the tutor, or the migration runner - would assert a
-- fact nobody established. NULL reads as "unknown, predates attestation", which is true.

alter table class_sessions
  add column if not exists hours_recorded_by uuid references profiles (id) on delete set null;

comment on column class_sessions.hours_recorded_by is
  'The profile that last wrote actual_start/actual_end. Compared against tutor_id to tell a '
  'self-recorded month from an independently recorded one (C-06). NULL = recorded before '
  'this column existed; never backfilled, because no attestation actually happened.';

-- Reading it is enough for the billing warning, and the column is written service-role
-- like every other session write. No new grant: authenticated holds no table-level write
-- on class_sessions (0096), and this column is deliberately NOT in the student's
-- column grant - a student must never be able to claim they recorded a tutor's hours.
create index if not exists class_sessions_hours_recorded_by_idx
  on class_sessions (hours_recorded_by)
  where hours_recorded_by is not null;
