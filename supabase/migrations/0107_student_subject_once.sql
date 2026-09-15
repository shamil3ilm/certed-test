-- 0107: a student takes a subject in ONE live class, and giving a class its subject is one
-- transaction.
--
-- A class is one student and one subject. Two live classes pairing the same student with the
-- same subject is a data error with no correct reading: the student's subject tabs show
-- "Physics, Physics", hours and attendance split across two records of one subject, and a
-- receipt bills the subject twice. An ARCHIVED class does not count - a subject dropped and
-- later taken up again is a new class.
--
-- Every way a live (student, subject) pair can come into being is a write to one of two rows,
-- so the rule is enforced on both, whatever wrote them:
--   enrollments  - a student enrolled (or re-enrolled) into a class that names a subject;
--   classes      - a class given a subject, or restored from the archive.
-- A service-role write skips RLS, so a trigger, not a policy, is what applies to every writer.
--
-- The check reads other rows, so it is serialised per student with a transaction-scoped
-- advisory lock: two concurrent writes for one student take turns, and the second one's check
-- sees the first one's committed row (each statement in a plpgsql function reads a fresh
-- snapshot under READ COMMITTED). Several students are locked in id order, so two writers
-- never wait on each other in a cycle.
--
-- Rows already in breach are not touched, and do not block this migration: the trigger fires
-- on a write to the row, and a rename does not re-check a subject. Find them with
--
--   select e.student_id, c.subject_id, array_agg(c.id)
--     from enrollments e join classes c on c.id = e.class_id
--    where e.active and c.status <> 'archived' and c.subject_id is not null
--    group by 1, 2 having count(*) > 1;
--
-- The two functions below are the service's writes. Each is one transaction, so a failure
-- part-way leaves nothing behind - no class without its student, no subject without its
-- relabelled history. They raise stable codes the service maps to messages:
--   subject_already_taken  - the rule above
--   subject_already_set    - the class names a subject already; it is never re-pointed
--   student_not_eligible   - not a student, or revoked
--   subject_not_found / class_not_found

begin;

-- ── the rule ────────────────────────────────────────────────────────────────

create or replace function lock_student_subjects(p_student_id uuid) returns void
language sql
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended('student-subject:' || p_student_id::text, 0));
$$;

create or replace function student_takes_subject_elsewhere(
  p_student_id uuid,
  p_subject_id uuid,
  p_class_id uuid
) returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
      from enrollments e
      join classes c on c.id = e.class_id
     where e.student_id = p_student_id
       and e.active
       and e.class_id <> p_class_id
       and c.status <> 'archived'
       and c.subject_id = p_subject_id
  );
$$;

create or replace function enforce_student_subject_once_on_enrollment() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject uuid;
begin
  if not new.active then
    return new;
  end if;
  -- An update that neither activates the row nor moves it changes no pair.
  if tg_op = 'UPDATE' and old.active and old.class_id = new.class_id and old.student_id = new.student_id then
    return new;
  end if;

  select subject_id into v_subject
    from classes
   where id = new.class_id and status <> 'archived';
  if v_subject is null then
    return new;
  end if;

  perform lock_student_subjects(new.student_id);
  if student_takes_subject_elsewhere(new.student_id, v_subject, new.class_id) then
    raise exception 'subject_already_taken';
  end if;
  return new;
end;
$$;

create or replace function enforce_student_subject_once_on_class() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  if new.subject_id is null or new.status = 'archived' then
    return new;
  end if;
  -- Only a new subject or a return from the archive creates a pair.
  if old.subject_id is not distinct from new.subject_id and old.status <> 'archived' then
    return new;
  end if;

  for v_student in
    select student_id from enrollments where class_id = new.id and active order by student_id
  loop
    perform lock_student_subjects(v_student);
    if student_takes_subject_elsewhere(v_student, new.subject_id, new.id) then
      raise exception 'subject_already_taken';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_student_subject_once on enrollments;
create trigger trg_student_subject_once
  before insert or update of active, class_id, student_id on enrollments
  for each row execute function enforce_student_subject_once_on_enrollment();

drop trigger if exists trg_student_subject_once on classes;
create trigger trg_student_subject_once
  before update of subject_id, status on classes
  for each row execute function enforce_student_subject_once_on_class();

-- ── add a subject to a student: the class and its enrolment together ───────

create or replace function create_student_subject_class(
  p_student_id uuid,
  p_subject_id uuid,
  p_name text
) returns classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes%rowtype;
begin
  -- Re-read under a share lock: a revoke landing after the service's own check would
  -- otherwise enrol a revoked account.
  perform 1 from profiles
   where id = p_student_id and role = 'student' and status <> 'disabled'
     for share;
  if not found then
    raise exception 'student_not_eligible';
  end if;
  perform 1 from subjects where id = p_subject_id;
  if not found then
    raise exception 'subject_not_found';
  end if;

  -- Taken before the class exists, so the check below and the enrolment trigger's are one
  -- critical section; the trigger re-takes the same lock, which a holder may do freely.
  perform lock_student_subjects(p_student_id);
  if exists (
    select 1
      from enrollments e join classes c on c.id = e.class_id
     where e.student_id = p_student_id and e.active
       and c.status <> 'archived' and c.subject_id = p_subject_id
  ) then
    raise exception 'subject_already_taken';
  end if;

  insert into classes (name, status, subject_id)
  values (p_name, 'active', p_subject_id)
  returning * into v_class;

  insert into enrollments (student_id, class_id, active)
  values (p_student_id, v_class.id, true);

  return v_class;
end;
$$;

-- ── name a class's missing subject, and label the history it recorded ──────

create or replace function set_class_subject_when_unset(
  p_class_id uuid,
  p_subject_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid;
  v_labelled integer;
begin
  perform 1 from subjects where id = p_subject_id;
  if not found then
    raise exception 'subject_not_found';
  end if;

  -- The row lock makes "is it still unset?" and the update one step: a second caller waits,
  -- then finds the subject set and is refused.
  select subject_id into v_current from classes where id = p_class_id for update;
  if not found then
    raise exception 'class_not_found';
  end if;
  if v_current is not null then
    raise exception 'subject_already_set';
  end if;

  -- Raises subject_already_taken through trg_student_subject_once.
  update classes set subject_id = p_subject_id where id = p_class_id;

  -- Only sessions that recorded no subject. A class that had none has only ever taught
  -- this one, so this labels history rather than rewriting it.
  update class_sessions set subject_id = p_subject_id
   where class_id = p_class_id and subject_id is null;
  get diagnostics v_labelled = row_count;

  return v_labelled;
end;
$$;

-- These functions do not authorise their caller; the service does, then calls them with the
-- service role. So EXECUTE is the whole control, and it is closed to the API roles.
revoke execute on function create_student_subject_class(uuid, uuid, text) from public, anon, authenticated;
grant execute on function create_student_subject_class(uuid, uuid, text) to service_role;
revoke execute on function set_class_subject_when_unset(uuid, uuid) from public, anon, authenticated;
grant execute on function set_class_subject_when_unset(uuid, uuid) to service_role;
revoke execute on function lock_student_subjects(uuid) from public, anon, authenticated;
revoke execute on function student_takes_subject_elsewhere(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function enforce_student_subject_once_on_enrollment() from public, anon, authenticated;
revoke execute on function enforce_student_subject_once_on_class() from public, anon, authenticated;

commit;
