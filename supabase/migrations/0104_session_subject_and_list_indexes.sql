-- 0104: give a session its OWN subject, and index the columns the session list filters on.
--
-- THE GAP: the session list shows Student / Class / Subject / Tutor, but only class_id and
-- tutor_id are columns on class_sessions. Subject was read from classes.subject_id at render
-- time, which is wrong in two ways that both bite the same user - the reader looking at one
-- tutor across several subjects.
--
--   1. IT CANNOT BE FILTERED. Narrowing by subject would need a join, and the mock query
--      builder (src/lib/mock/query-builder.ts) has no join support - a PostgREST embedded
--      select would work in production and silently return unfiltered rows in the whole E2E
--      suite. The join-free alternative, resolving subject -> class ids and passing them to
--      `.in('class_id', ...)`, puts one uuid per class in a GET URL; for a 1:1 academy that
--      is one per student per subject, and the request outgrows the URL limit.
--   2. IT IS NOT HISTORY. classes.subject_id is the class's subject TODAY. Edit it and every
--      past session silently relabels, so a month already billed reports under a subject it
--      was never taught as. tutor_id on this table exists for exactly this reason (0047
--      records who taught it, not who teaches the class now); subject was the half left
--      behind.
--
-- Backfilled, unlike 0102's hours_recorded_by: the class's subject IS the best available
-- record of what a past session taught, so copying it asserts nothing new. It stays nullable
-- because a legacy class may have no subject at all (0064).

begin;

alter table class_sessions
  add column if not exists subject_id uuid references subjects (id) on delete set null;

comment on column class_sessions.subject_id is
  'The subject this session taught, captured when it was recorded. Copied from '
  'classes.subject_id at insert and NOT kept in step afterwards - re-pointing a class at a '
  'different subject must not rewrite what past sessions taught. NULL when the class had no '
  'subject.';

-- Backfill every existing row from its class. Idempotent: only fills what is still null, so
-- re-running never overwrites a session whose subject was corrected by hand.
update class_sessions s
   set subject_id = c.subject_id
  from classes c
 where c.id = s.class_id
   and s.subject_id is null
   and c.subject_id is not null;

-- Fill it on INSERT for any writer that does not supply it. The app sets the column
-- explicitly (mock mode runs no triggers, so the E2E suite would otherwise diverge from
-- production), but a session can also be created straight through PostgREST by a tutor, and
-- a row with no subject would drop out of every subject-filtered view without being wrong
-- enough to notice.
create or replace function set_session_subject_from_class() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.subject_id is null then
    select c.subject_id into new.subject_id from classes c where c.id = new.class_id;
  end if;
  return new;
end $$;

revoke execute on function set_session_subject_from_class() from public, anon, authenticated;
grant execute on function set_session_subject_from_class() to service_role;

drop trigger if exists class_sessions_set_subject on class_sessions;
create trigger class_sessions_set_subject
  before insert on class_sessions
  for each row execute function set_session_subject_from_class();

-- 0070 replaced the role-wide SELECT with an explicit column list and noted that a column
-- added later is unreadable by authenticated until listed. subject_id belongs on that list:
-- a student already sees their own class's subject everywhere else, and the session read the
-- student's attendance page makes goes through the RLS client. staff_note and
-- hours_recorded_by stay off it, as before.
grant select (subject_id) on table class_sessions to authenticated;

-- The list orders by session_date desc and filters on subject, tutor or class. class_id and
-- tutor_id already lead an index (0047/0093, 0101) - but 0101's is on actual_start, which a
-- date-ordered list cannot use, and nothing indexed subject or a bare date sort at all.
create index if not exists class_sessions_subject_date_idx
  on class_sessions (subject_id, session_date desc)
  where subject_id is not null;

create index if not exists class_sessions_tutor_date_idx
  on class_sessions (tutor_id, session_date desc)
  where tutor_id is not null;

create index if not exists class_sessions_date_idx
  on class_sessions (session_date desc);

commit;
