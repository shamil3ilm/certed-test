-- 0101: close the gaps left around 0100's billing integrity, and bound the one
-- unbounded table.
--
-- Four independent fixes, grouped because the first three all concern class_sessions
-- and the fourth is a one-statement retention job.

-- ── 1. The hour-lock guarded UPDATE only ─────────────────────────────────────
-- 0100 froze the hour-bearing fields of a session once a LIVE pay slip billed that
-- payee's month, and said so in the database rather than the service layer because
-- "these columns are otherwise reachable by any writer". But the trigger was BEFORE
-- UPDATE, which leaves the two larger operations open:
--
--   DELETE - refused by the class_sessions_delete policy (admin only, 0083)... except
--     the app deletes through the SERVICE ROLE (deleteSessionById), so RLS never runs
--     and the only gate is deleteSessionTimes' canWriteClass = any tutor of the class.
--     0083 justified its admin-only policy with "the app ... never hard-deletes
--     class_sessions"; 0093/0094 added exactly that path afterwards, so the premise
--     went stale. Deleting also CASCADEs the session's attendance away (0099).
--   INSERT - never guarded at all, and class_sessions_insert admits teaches_class, so
--     a tutor can add a session to an already-billed month straight through PostgREST
--     with no application audit entry.
--
-- Both change the hours behind an issued pay slip, which is what C-06 exists to stop.
-- Extend the same trigger to all three verbs.
--
-- A session with NO recorded window contributes zero minutes, so inserting or removing
-- one cannot move a total: those are allowed, which keeps the timeless session that
-- attendance marking auto-creates (services/attendance/marking.ts) working.

create or replace function guard_billed_session_hours() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  billed_number text;
  subject_tutor uuid;
  subject_date  date;
  has_window    boolean;
begin
  if tg_op = 'UPDATE' then
    -- Only the fields that determine pay. Summary, feedback and staff notes stay editable
    -- after issuance: they are the pastoral record, and freezing them would lose detail
    -- that is often written up later.
    if new.actual_start is not distinct from old.actual_start
       and new.actual_end is not distinct from old.actual_end
       and new.tutor_id is not distinct from old.tutor_id then
      return new;
    end if;
    subject_tutor := old.tutor_id;
    subject_date  := old.session_date;
    has_window    := old.actual_start is not null or new.actual_start is not null;
  elsif tg_op = 'DELETE' then
    subject_tutor := old.tutor_id;
    subject_date  := old.session_date;
    has_window    := old.actual_start is not null;
  else -- INSERT
    subject_tutor := new.tutor_id;
    subject_date  := new.session_date;
    has_window    := new.actual_start is not null;
  end if;

  -- No payee or no billable window: nothing about this row can move a month's total.
  if subject_tutor is null or not has_window then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- The month this session belongs to, matched against a live pay slip for its payee.
  select p.number into billed_number
  from payslips p
  where p.voided = false
    and p.billing_period = to_char(subject_date, 'YYYY-MM')
    and p.tutor_id = subject_tutor
  limit 1;

  if billed_number is not null then
    raise exception
      'Session hours are locked: pay slip % already billed % for this payee. Void it first, then correct and reissue.',
      billed_number, to_char(subject_date, 'YYYY-MM')
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

revoke execute on function guard_billed_session_hours() from public, anon, authenticated;
grant execute on function guard_billed_session_hours() to service_role;

drop trigger if exists class_sessions_guard_billed_hours on class_sessions;
create trigger class_sessions_guard_billed_hours
  before insert or update or delete on class_sessions
  for each row execute function guard_billed_session_hours();

-- ── 2. Tutor double-booking was enforced only by a check-then-act read ───────
-- assertNoTutorOverlap SELECTs overlapping sessions and rejects if any come back, then
-- inserts. Two concurrent saves (two tabs, or the tutor form racing the mentor timings
-- editor) both read an empty set and both insert, and 0093 deliberately dropped the old
-- unique (class_id, session_date), so nothing in the schema catches it. Both windows
-- then flow into aggregateClassTutorHours and are paid.
--
-- An exclusion constraint makes the invariant true rather than merely checked. The app
-- check stays: it produces a clean message, and this is the backstop underneath it.
--
-- IF THIS FAILS TO CREATE, existing rows already overlap. Find them with:
--   select a.id, b.id, a.tutor_id, a.actual_start, a.actual_end
--     from class_sessions a join class_sessions b
--       on a.tutor_id = b.tutor_id and a.id < b.id
--      and tstzrange(a.actual_start, a.actual_end) && tstzrange(b.actual_start, b.actual_end)
--    where a.actual_start is not null and b.actual_start is not null;
do $$
begin
  begin
    create extension if not exists btree_gist;
  exception when others then
    raise warning 'btree_gist could not be installed (%) - the tutor-overlap exclusion constraint was NOT created, so concurrent saves can still double-book a tutor. Install btree_gist and re-run this migration.', sqlerrm;
    return;
  end;

  if not exists (
    select 1 from pg_constraint where conname = 'class_sessions_no_tutor_overlap'
  ) then
    alter table class_sessions
      add constraint class_sessions_no_tutor_overlap
      exclude using gist (
        tutor_id with =,
        tstzrange(actual_start, actual_end) with &&
      )
      where (tutor_id is not null and actual_start is not null and actual_end is not null);
  end if;

  -- Fail LOUD rather than quiet. A skipped constraint here means the double-booking
  -- protection this migration exists to add is simply absent, and a notice is invisible
  -- in most tooling - the same silent-skip shape the guard above was written to avoid.
  if not exists (select 1 from pg_constraint where conname = 'class_sessions_no_tutor_overlap') then
    raise warning 'class_sessions_no_tutor_overlap is NOT present after 0101 - two concurrent session saves can still double-book a tutor, and both windows will be paid.';
  end if;
end $$;

-- ── 3. The double-booking read had no index to use ───────────────────────────
-- selectTutorOverlappingSessions filters `tutor_id = $1 and actual_start < $2 and
-- actual_end > $3`, but every class_sessions index leads with class_id or id, so it was
-- a sequential scan - on the highest-frequency write path in the app (every session save
-- and every mentor time edit).
create index if not exists class_sessions_tutor_window_idx
  on class_sessions (tutor_id, actual_start)
  where actual_start is not null;

-- ── 4. rate_limit_counters grew without bound, keyed by IP ───────────────────
-- rate_limit_hit() only ever inserts-or-updates; nothing removes. The public register
-- and contact forms key their buckets on the client IP, so the table accumulates one
-- permanent row per distinct IP that ever touched them - personal data, retained
-- indefinitely, belonging to people who never became users and whom eraseUser therefore
-- can never reach. Every other high-churn table (notifications 0051, pending_emails
-- 0058, audit_log 0059) already has a retention job; this one was missed.
--
-- A counter is meaningless once its window has passed, so an hour of slack past the
-- longest window in use (10 minutes) is generous.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable (bare local Postgres?) - skipping rate-limit retention schedule';
    return;
  end;

  if exists (select 1 from cron.job where jobname = 'purge-expired-rate-limits') then
    perform cron.unschedule('purge-expired-rate-limits');
  end if;

  perform cron.schedule(
    'purge-expired-rate-limits',
    '15 * * * *',
    $q$ delete from public.rate_limit_counters where window_started_at < now() - interval '1 hour' $q$
  );
end $$;

-- ── 5. The download counter was a read-modify-write ──────────────────────────
-- incrementResourceDownloadCount SELECTed download_count and then UPDATEd it to value+1,
-- so two concurrent downloads of the same document both read the same number and the pair
-- counted as one. Do the arithmetic in the database, where the row is locked for the
-- duration of the update. Service-role only: the app calls it from the download route
-- after the access check, and it must not be reachable from a client.
create or replace function increment_resource_download_count(p_resource_id uuid) returns void
language sql security definer set search_path = public as $$
  update resources set download_count = download_count + 1 where id = p_resource_id;
$$;

revoke execute on function increment_resource_download_count(uuid) from public, anon, authenticated;
grant execute on function increment_resource_download_count(uuid) to service_role;
