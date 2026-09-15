-- 0116: a month a live receipt bills is locked for that student, as a pay slip's is for its payee.
--
-- 0100/0110 lock a session's hours once a live pay slip bills its payee's month. A receipt bills a
-- student's month the same way - the student's present and late marks, at each session's recorded
-- window - but nothing held it: marking a student absent, clearing a session's marks, or re-timing
-- or deleting a session after the receipt was issued changed what the month adds up to, and the
-- issued receipt silently stopped matching the record.
--
-- The rule: a month with a live billing-period document is closed for everything that document
-- bills. A correction is void, correct, reissue.
--
--   attendance      a mark that counts (present or late) cannot be added, removed, switched to or
--                   from absent, or moved to another session or student, in a month a live receipt
--                   bills for that student. Present <-> late, join/leave times and who marked it do
--                   not change the figure and stay editable.
--   class_sessions  re-timing or deleting a session is refused when a student with a counting mark
--                   on it has a live receipt for the month either side of the change. The pay slip
--                   check is unchanged.
--
-- Both take the per-party lock issue_receipt_doc takes (0110): an edit either commits before an
-- issue reads the hours - and the fingerprint refuses the issue - or waits and then sees the
-- receipt. A counting mark also takes a share lock on its session row, so a mark and a re-time of
-- the same session run one after the other and each sees the other's result.
--
-- The attendance guard runs AFTER the write. A roster save is one upsert; a BEFORE INSERT trigger
-- fires for every proposed row, including rows that already exist and become updates, so one
-- billed student would block marking the whole class. AFTER triggers fire for the action taken.
--
-- Refused with check_violation and a message starting "Session hours are locked", which the data
-- layer turns into the message a person sees (src/lib/data/hours-lock.ts).

begin;

create or replace function assert_student_hours_unbilled(p_student_id uuid, p_month text) returns void
language plpgsql
set search_path = public
as $$
declare
  v_number text;
begin
  if p_student_id is null or p_month is null then
    return;
  end if;
  -- The key issue_receipt_doc takes for this student.
  perform pg_advisory_xact_lock(hashtextextended('finance-issue:receipt:' || p_student_id::text, 0));
  select number into v_number
    from receipts
   where voided = false and billing_period = p_month and student_id = p_student_id
   limit 1;
  if v_number is not null then
    raise exception
      'Session hours are locked: receipt % already billed % for this student. Void it first, then correct and reissue.',
      v_number, p_month
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function guard_billed_attendance() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_student uuid;
  v_old_month text;
  v_new_student uuid;
  v_new_month text;
begin
  if tg_op = 'UPDATE'
     and new.student_id is not distinct from old.student_id
     and new.session_id is not distinct from old.session_id
     and (new.status in ('present', 'late')) = (old.status in ('present', 'late')) then
    return null;
  end if;

  -- A mark bills toward the month its session's recorded start falls in. A session deleted in
  -- this statement is already gone here (its marks go by cascade); its own guard checked them.
  if tg_op <> 'INSERT' and old.status in ('present', 'late') then
    v_old_student := old.student_id;
    select institute_month(s.actual_start) into v_old_month
      from class_sessions s where s.id = old.session_id for share;
  end if;
  if tg_op <> 'DELETE' and new.status in ('present', 'late') then
    v_new_student := new.student_id;
    select institute_month(s.actual_start) into v_new_month
      from class_sessions s where s.id = new.session_id for share;
  end if;

  -- Locked in a fixed order, as the session guard does for payees.
  if v_new_student is not null and (v_old_student is null or v_new_student::text < v_old_student::text) then
    perform assert_student_hours_unbilled(v_new_student, v_new_month);
    perform assert_student_hours_unbilled(v_old_student, v_old_month);
  else
    perform assert_student_hours_unbilled(v_old_student, v_old_month);
    perform assert_student_hours_unbilled(v_new_student, v_new_month);
  end if;
  return null;
end;
$$;

drop trigger if exists attendance_guard_billed_hours on attendance;
create trigger attendance_guard_billed_hours
  after insert or update or delete on attendance
  for each row execute function guard_billed_attendance();

create or replace function guard_billed_session_hours() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_tutor uuid;
  v_old_month text;
  v_new_tutor uuid;
  v_new_month text;
  v_student uuid;
begin
  if tg_op = 'UPDATE'
     and new.actual_start is not distinct from old.actual_start
     and new.actual_end is not distinct from old.actual_end
     and new.tutor_id is not distinct from old.tutor_id then
    -- Only the fields that determine pay. Summary, feedback and staff notes stay editable
    -- after issuance: they are the pastoral record, often written up later.
    return new;
  end if;

  -- A session counts toward the month its recorded start falls in; one with no start
  -- counts toward none.
  if tg_op <> 'INSERT' and old.actual_start is not null then
    v_old_tutor := old.tutor_id;
    v_old_month := institute_month(old.actual_start);
  end if;
  if tg_op <> 'DELETE' and new.actual_start is not null then
    v_new_tutor := new.tutor_id;
    v_new_month := institute_month(new.actual_start);
  end if;

  -- Both sides, locked in a fixed order so two sessions moved in opposite directions
  -- between two payees cannot deadlock.
  if v_new_tutor is not null and (v_old_tutor is null or v_new_tutor::text < v_old_tutor::text) then
    perform assert_session_hours_unbilled(v_new_tutor, v_new_month);
    perform assert_session_hours_unbilled(v_old_tutor, v_old_month);
  else
    perform assert_session_hours_unbilled(v_old_tutor, v_old_month);
    perform assert_session_hours_unbilled(v_new_tutor, v_new_month);
  end if;

  -- The students a receipt bills this session to: everyone with a counting mark on it. A new
  -- session has no marks, and a change of tutor alone does not change what a student is billed.
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and (new.actual_start is distinct from old.actual_start
                               or new.actual_end is distinct from old.actual_end)) then
    for v_student in
      select a.student_id
        from attendance a
       where a.session_id = old.id and a.status in ('present', 'late')
       group by a.student_id
       order by a.student_id::text
    loop
      perform assert_student_hours_unbilled(v_student, institute_month(old.actual_start));
      if tg_op = 'UPDATE' then
        perform assert_student_hours_unbilled(v_student, institute_month(new.actual_start));
      end if;
    end loop;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function assert_student_hours_unbilled(uuid, text) from public, anon, authenticated;
revoke execute on function guard_billed_attendance() from public, anon, authenticated;

commit;
