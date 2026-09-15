-- 0114: nothing is added to an archived class, whoever writes it and whenever.
--
-- Every service refuses to add a student, tutor, assignment, announcement, document, meet link,
-- calendar event or timetable slot to an archived class - by reading the class's status first
-- (assertClassActive, selectClassStatus) and inserting after. An archive committing between that
-- read and the insert lands content in a class that is hidden from everyone who would act on it,
-- and a writer that skips the service (a direct PostgREST write under RLS) is not checked at all.
--
-- The rule also holds in the database: a trigger on each of those tables refuses a row that
-- ADDS to an archived class. It locks the class row FOR SHARE while it checks, so it waits for an
-- archive in flight (the archive's update holds the row) and sees its outcome.
--
-- What counts as adding: inserting a row, moving a row to another class, or making a row live
-- again (status back to 'active', or active back to true). Archiving, editing and deactivating
-- content in an archived class stay allowed - restore and cleanup must still work.
--
-- Refusal code: class_archived. The services check first and say so themselves; a write that
-- races past that check gets the same message from this refusal (src/lib/api/database-refusals.ts).

begin;

create or replace function guard_class_accepts_content() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_class uuid := (v_new ->> 'class_id')::uuid;
begin
  -- Academy-wide rows (announcements, meet links, events with no class) are not class content.
  if v_class is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    if not (
      (v_old ->> 'class_id') is distinct from (v_new ->> 'class_id')
      or (v_new ? 'status' and v_new ->> 'status' in ('active', 'pending')
          and (v_old ->> 'status') not in ('active', 'pending'))
      or (v_new ? 'active' and (v_new ->> 'active')::boolean
          and not coalesce((v_old ->> 'active')::boolean, false))
    ) then
      return new;
    end if;
  else
    -- A row inserted already archived or inactive adds nothing live.
    if (v_new ? 'active' and not (v_new ->> 'active')::boolean)
       or (v_new ? 'status' and v_new ->> 'status' not in ('active', 'pending')) then
      return new;
    end if;
  end if;

  -- FOR SHARE needs more than SELECT on classes, which is why this runs as the function owner.
  perform 1 from classes where id = v_class and status = 'active' for share;
  if not found then
    raise exception 'class_archived';
  end if;
  return new;
end;
$$;

revoke execute on function guard_class_accepts_content() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'enrollments', 'class_tutors', 'assignments', 'announcements', 'resources',
    'meet_links', 'calendar_events', 'timetable_slots'
  ] loop
    execute format('drop trigger if exists trg_class_accepts_content on %I', t);
    execute format(
      'create trigger trg_class_accepts_content before insert or update on %I '
      'for each row execute function guard_class_accepts_content()', t);
  end loop;
end $$;

commit;
