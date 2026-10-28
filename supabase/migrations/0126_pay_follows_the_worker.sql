-- 0126: a pay slip pays the person who did the work.
--
-- Until now the billing SQL paid by `tutor_id` alone. That was right while a session had one kind
-- and one worker, and 0123 changed both: an EXAM can be monitored by someone other than the class
-- tutor, and a DEMO class is not working time. The hours reports (My hours, the breakdown) already
-- credit the monitor and leave demos out; the pay slip did not, so a tutor was paid for an exam they
-- were not in the room for, its monitor was paid nothing, and a demo class was paid as teaching.
--
-- One rule, in one place: session_pay_worker(kind, tutor_id, monitor_id) -
--     regular   the tutor
--     exam      the monitor, or the tutor when nobody else monitored it
--     demo      nobody: never working time
-- It is the same rule as the application's sessionWorker, and both the things below read it, so a
-- pay slip and the figure behind it cannot disagree about who was paid.
--
--   1. billing_source_fingerprint('payslip') fingerprints the sessions the party is the WORKER of.
--      The fingerprint is what the issue function re-checks under its lock, so a session edited
--      between the draft and the issue is still caught - for the monitor now as well as the tutor.
--   2. guard_billed_session_hours locks the WORKER'S billed month, not the tutor's. A pay slip
--      already issued to a monitor freezes the exam hours it billed; changing a session's kind or
--      monitor (which moves hours between people) is guarded as the change of payee that it is.
--
-- Receipts are untouched: they bill a student for the hours they received.
-- Nothing is rewritten: pay slips already issued stay as they are, and the lock simply applies to
-- the right person from here on. To undo, re-apply guard_billed_session_hours from 0116 and
-- billing_source_fingerprint from 0110.

begin;

create or replace function session_pay_worker(p_kind text, p_tutor_id uuid, p_monitor_id uuid) returns uuid
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_kind, 'regular')
           when 'demo' then null
           when 'exam' then coalesce(p_monitor_id, p_tutor_id)
           else p_tutor_id
         end
$$;

comment on function session_pay_worker(text, uuid, uuid) is
  'Whose working time (and so whose pay) a session is: the tutor for a class, the monitor for an exam someone else monitored, nobody for a demo. Mirrors sessionWorker in the application.';

-- ── the billed-hours guard, on the worker ───────────────────────────────────

-- This is 0116's function (which added the receipt lock to 0110's), with ONE change: the pay-slip
-- side locks the WORKER'S month instead of the tutor's, and treats a change of kind or monitor as
-- the change of payee it is. The receipt side is carried over as 0116 wrote it: a receipt bills a
-- student the hours they received, whatever the kind, so only a re-time or a delete reaches it.
create or replace function guard_billed_session_hours() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_worker uuid;
  v_old_month text;
  v_new_worker uuid;
  v_new_month text;
  v_student uuid;
begin
  if tg_op = 'UPDATE'
     and new.actual_start is not distinct from old.actual_start
     and new.actual_end is not distinct from old.actual_end
     and new.tutor_id is not distinct from old.tutor_id
     and new.kind is not distinct from old.kind
     and new.monitor_id is not distinct from old.monitor_id then
    -- Only the fields that determine pay: when, for how long, and whose. Summary, feedback and
    -- staff notes stay editable after issuance: they are the pastoral record, often written up later.
    return new;
  end if;

  -- A session counts toward the month its recorded start falls in; one with no start
  -- counts toward none. Its worker is whoever the pay rule says - nobody for a demo.
  if tg_op <> 'INSERT' and old.actual_start is not null then
    v_old_worker := session_pay_worker(old.kind, old.tutor_id, old.monitor_id);
    v_old_month := institute_month(old.actual_start);
  end if;
  if tg_op <> 'DELETE' and new.actual_start is not null then
    v_new_worker := session_pay_worker(new.kind, new.tutor_id, new.monitor_id);
    v_new_month := institute_month(new.actual_start);
  end if;

  -- Both sides, locked in a fixed order so two sessions moved in opposite directions
  -- between two payees cannot deadlock.
  if v_new_worker is not null and (v_old_worker is null or v_new_worker::text < v_old_worker::text) then
    perform assert_session_hours_unbilled(v_new_worker, v_new_month);
    perform assert_session_hours_unbilled(v_old_worker, v_old_month);
  else
    perform assert_session_hours_unbilled(v_old_worker, v_old_month);
    perform assert_session_hours_unbilled(v_new_worker, v_new_month);
  end if;

  -- The students a receipt bills this session to: everyone with a counting mark on it. A new
  -- session has no marks, and a change of tutor, kind or monitor alone does not change what a
  -- student is billed.
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

-- ── the billing-source fingerprint, on the worker ───────────────────────────

create or replace function billing_source_fingerprint(
  p_kind text,
  p_party_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source text;
begin
  if p_kind = 'payslip' then
    -- The sessions the payee is the WORKER of. The kind is part of the fingerprint: turning a class
    -- into a demo, or an exam's monitor into someone else, moves hours between people.
    select count(*)::text || '|' ||
           coalesce(sum(extract(epoch from (s.actual_end - s.actual_start))), 0)::text || '|' ||
           coalesce(string_agg(s.id::text || ':' || s.class_id::text || ':' || coalesce(s.subject_id::text, '')
                               || ':' || coalesce(s.actual_end::text, '') || ':' || s.kind, ',' order by s.id), '')
      into v_source
      from class_sessions s
      join classes c on c.id = s.class_id
     where session_pay_worker(s.kind, s.tutor_id, s.monitor_id) = p_party_id
       and s.actual_start >= p_from and s.actual_start < p_to
       and c.status <> 'archived';
  elsif p_kind = 'receipt' then
    select count(*)::text || '|' ||
           coalesce(sum(extract(epoch from (s.actual_end - s.actual_start))), 0)::text || '|' ||
           coalesce(string_agg(s.id::text || ':' || s.class_id::text || ':' || coalesce(s.subject_id::text, '')
                               || ':' || coalesce(s.actual_end::text, ''), ',' order by s.id), '')
      into v_source
      from attendance a
      join class_sessions s on s.id = a.session_id
      join classes c on c.id = s.class_id
     where a.student_id = p_party_id
       and a.status in ('present', 'late')
       and s.actual_start >= p_from and s.actual_start < p_to
       and c.status <> 'archived';
  else
    raise exception 'invalid_kind';
  end if;
  return md5(v_source);
end;
$$;

-- Same grants as the functions they sit beside (0110): the server calls these; nobody else.
revoke execute on function session_pay_worker(text, uuid, uuid) from public, anon, authenticated;
grant execute on function session_pay_worker(text, uuid, uuid) to service_role;
revoke execute on function guard_billed_session_hours() from public, anon, authenticated;
grant execute on function guard_billed_session_hours() to service_role;
revoke execute on function billing_source_fingerprint(text, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function billing_source_fingerprint(text, uuid, timestamptz, timestamptz) to service_role;

commit;
