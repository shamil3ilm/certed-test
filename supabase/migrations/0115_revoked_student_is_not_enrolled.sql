-- 0115: a revoked account is never enrolled, whoever writes it and whenever.
--
-- enrolStudent refuses a revoked student by reading the profile's status first and upserting the
-- enrolment after. A revoke committing between that read and the write enrols an account that has
-- just lost access, and a writer that skips the service (a direct write with the service role) is
-- not checked at all. create_student_subject_class already re-reads the student under a share lock
-- (0107); a plain enrolment did not.
--
-- The rule now also holds in the database: a trigger on enrollments refuses a row that makes an
-- enrolment live for an account that is not a student, or is revoked. It locks the profile row
-- FOR SHARE while it checks, so it waits for a revoke in flight (revoke_profile_guarded holds that
-- row FOR UPDATE) and sees its outcome.
--
-- What counts as enrolling: inserting an active row, making an inactive row active, or moving an
-- active row to another student or class. Revoking does not deactivate a student's enrolments -
-- a restore brings the account back to the classes it had - so a revoked student with live rows is
-- the normal state after a revoke. Editing or deactivating those rows stays allowed. A PENDING
-- student (invited, not yet signed in) may be enrolled, as the service allows.
--
-- Refusal code: student_not_eligible, the code 0107 already raises for the same rule. The service
-- checks first and says so itself; a write that races past that check gets the message mapped in
-- src/lib/api/database-refusals.ts.

begin;

create or replace function guard_enrollment_student_eligible() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.active then
    return new;
  end if;
  -- An update that neither activates the row nor moves it enrols no one.
  if tg_op = 'UPDATE' and old.active
     and old.student_id = new.student_id and old.class_id = new.class_id then
    return new;
  end if;

  -- FOR SHARE needs more than SELECT on profiles, which is why this runs as the function owner.
  perform 1 from profiles
   where id = new.student_id and role = 'student' and status <> 'disabled'
   for share;
  if not found then
    raise exception 'student_not_eligible';
  end if;
  return new;
end;
$$;

revoke execute on function guard_enrollment_student_eligible() from public, anon, authenticated;

drop trigger if exists trg_enrollment_student_eligible on enrollments;
create trigger trg_enrollment_student_eligible
  before insert or update of active, class_id, student_id on enrollments
  for each row execute function guard_enrollment_student_eligible();

commit;
