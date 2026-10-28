-- Pay follows the worker (0126), asserted against REAL Postgres.
--
-- Run by scripts/test-pay-worker.sh against a database the whole migration chain has been applied to.
-- Each section raises on failure and prints "OK <n>: ..." on success; the script requires every OK, so
-- a section that silently stopped running is a failure too. Everything is rolled back at the end.
--
--   1  the rule: regular -> the tutor, exam -> the monitor (else the tutor), demo -> nobody
--   2  the billing-source fingerprint follows the worker, and the kind is part of it
--   3  the billed-month lock follows the worker: a pay slip locks its payee's hours, and moving an
--      exam or reclassifying a class is guarded as the change of payee it is
--   4  summary and notes stay editable after issuance (the pastoral record)
--   5  0116's RECEIPT lock survives this migration, and a kind change alone does not touch a student

\set ON_ERROR_STOP on
begin;

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into profiles (id, email, role, status, full_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'tutor@x.test',   'tutor', 'active', 'Tara Tutor'),
  ('00000000-0000-4000-8000-0000000000a2', 'monitor@x.test', 'tutor', 'active', 'Mona Monitor');
insert into classes (id, name) values ('00000000-0000-4000-8000-0000000000c1', 'Maths');

-- T = a1, M = a2, C = c1
insert into class_sessions (id, class_id, session_date, tutor_id, monitor_id, kind, actual_start, actual_end) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1', '2026-08-10', '00000000-0000-4000-8000-0000000000a1', null,                                   'regular', '2026-08-10 10:00+00', '2026-08-10 11:00+00'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c1', '2026-08-10', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', 'exam',    '2026-08-10 12:00+00', '2026-08-10 13:00+00'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000c1', '2026-08-10', '00000000-0000-4000-8000-0000000000a1', null,                                   'demo',    '2026-08-10 14:00+00', '2026-08-10 15:00+00'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000c1', '2026-08-10', '00000000-0000-4000-8000-0000000000a1', null,                                   'exam',    '2026-08-10 16:00+00', '2026-08-10 17:00+00');

-- ── 1. the rule ─────────────────────────────────────────────────────────────
do $$
declare t uuid := '00000000-0000-4000-8000-0000000000a1'; m uuid := '00000000-0000-4000-8000-0000000000a2';
begin
  assert session_pay_worker('regular', t, null) = t,  'regular: the tutor';
  assert session_pay_worker('regular', t, m)    = t,  'regular ignores a stray monitor';
  assert session_pay_worker('exam', t, m)       = m,  'exam: the monitor';
  assert session_pay_worker('exam', t, null)    = t,  'exam, no monitor: the tutor';
  assert session_pay_worker('demo', t, null) is null, 'demo: nobody';
  assert session_pay_worker(null, t, null)      = t,  'a null kind reads as regular';
  assert (select count(*) from class_sessions s where session_pay_worker(s.kind, s.tutor_id, s.monitor_id) = t) = 2, 'tutor is the worker of the class session and the exam they monitored';
  assert (select count(*) from class_sessions s where session_pay_worker(s.kind, s.tutor_id, s.monitor_id) = m) = 1, 'monitor is the worker of the exam';
  raise notice 'OK 1: the rule';
end $$;

-- ── 2. the fingerprint follows the worker ───────────────────────────────────
create temp table fp as select
  billing_source_fingerprint('payslip', '00000000-0000-4000-8000-0000000000a1', '2026-08-01+00', '2026-09-01+00') as t,
  billing_source_fingerprint('payslip', '00000000-0000-4000-8000-0000000000a2', '2026-08-01+00', '2026-09-01+00') as m;

update class_sessions set actual_end = '2026-08-10 13:30+00' where id = '00000000-0000-4000-8000-0000000000b2';  -- the monitor's exam grows
do $$
declare t uuid := '00000000-0000-4000-8000-0000000000a1'; m uuid := '00000000-0000-4000-8000-0000000000a2';
        f record;
begin
  select * into f from fp;
  assert billing_source_fingerprint('payslip', m, '2026-08-01+00', '2026-09-01+00') <> f.m, 'the monitor fingerprint moves when their exam changes';
  assert billing_source_fingerprint('payslip', t, '2026-08-01+00', '2026-09-01+00')  = f.t, 'the class tutor fingerprint does NOT move for an exam they did not monitor';
  raise notice 'OK 2a: an exam edit moves the monitor, not the tutor';
end $$;

update class_sessions set actual_end = '2026-08-10 15:30+00' where id = '00000000-0000-4000-8000-0000000000b3';  -- a demo changes
do $$
declare t uuid := '00000000-0000-4000-8000-0000000000a1'; f record;
begin
  select * into f from fp;
  assert billing_source_fingerprint('payslip', t, '2026-08-01+00', '2026-09-01+00') = f.t, 'a demo is not in anyone''s pay';
  raise notice 'OK 2b: a demo is in nobody''s fingerprint';
end $$;

update class_sessions set kind = 'demo' where id = '00000000-0000-4000-8000-0000000000b1';                          -- the class session becomes a demo
do $$
declare t uuid := '00000000-0000-4000-8000-0000000000a1'; f record;
begin
  select * into f from fp;
  assert billing_source_fingerprint('payslip', t, '2026-08-01+00', '2026-09-01+00') <> f.t, 'turning a class into a demo moves the tutor''s fingerprint';
  raise notice 'OK 2c: a kind change moves hours between people';
end $$;
update class_sessions set kind = 'regular' where id = '00000000-0000-4000-8000-0000000000b1';

-- ── 3. the billed-month lock follows the worker ─────────────────────────────
-- A pay slip for the CLASS TUTOR only.
insert into payslips (id, number, tutor_id, tutor_name_snapshot, currency, subtotal, total, billing_period)
values ('00000000-0000-4000-8000-0000000000f1', 'PS-T-1', '00000000-0000-4000-8000-0000000000a1', 'Tara Tutor', 'INR', 0, 0, '2026-08');

do $$
begin
  -- the tutor's own class session is locked
  begin
    update class_sessions set actual_end = '2026-08-10 11:30+00' where id = '00000000-0000-4000-8000-0000000000b1';
    raise exception 'expected the tutor''s class session to be locked';
  exception when check_violation then null; end;

  -- the exam is the MONITOR's hours, and the monitor has no pay slip: NOT locked by the tutor's
  update class_sessions set actual_end = '2026-08-10 13:45+00' where id = '00000000-0000-4000-8000-0000000000b2';

  -- a demo is nobody's hours
  update class_sessions set actual_end = '2026-08-10 15:45+00' where id = '00000000-0000-4000-8000-0000000000b3';

  -- the exam the tutor monitored themselves IS theirs
  begin
    update class_sessions set actual_end = '2026-08-10 17:30+00' where id = '00000000-0000-4000-8000-0000000000b4';
    raise exception 'expected the tutor''s own exam to be locked';
  exception when check_violation then null; end;

  -- handing the exam to the tutor moves hours ONTO a billed payee: refused
  begin
    update class_sessions set monitor_id = null where id = '00000000-0000-4000-8000-0000000000b2';
    raise exception 'expected moving an exam onto a billed tutor to be refused';
  exception when check_violation then null; end;

  -- turning the tutor's class into a demo takes hours OFF a billed payee: refused
  begin
    update class_sessions set kind = 'demo' where id = '00000000-0000-4000-8000-0000000000b1';
    raise exception 'expected reclassifying a billed class to be refused';
  exception when check_violation then null; end;

  raise notice 'OK 3a: the tutor''s pay slip locks the tutor''s hours only';
end $$;

-- Now the pay slip is the MONITOR's, and the tutor's is voided.
update payslips set voided = true where id = '00000000-0000-4000-8000-0000000000f1';
insert into payslips (id, number, tutor_id, tutor_name_snapshot, currency, subtotal, total, billing_period)
values ('00000000-0000-4000-8000-0000000000f2', 'PS-M-1', '00000000-0000-4000-8000-0000000000a2', 'Mona Monitor', 'INR', 0, 0, '2026-08');

do $$
begin
  begin
    update class_sessions set actual_end = '2026-08-10 13:50+00' where id = '00000000-0000-4000-8000-0000000000b2';
    raise exception 'expected the monitor''s billed exam to be locked';
  exception when check_violation then null; end;

  -- and the tutor, no longer billed, can edit their class again
  update class_sessions set actual_end = '2026-08-10 11:30+00' where id = '00000000-0000-4000-8000-0000000000b1';

  -- deleting the monitor's billed exam is also a change of billed hours
  begin
    delete from class_sessions where id = '00000000-0000-4000-8000-0000000000b2';
    raise exception 'expected deleting a billed exam to be refused';
  exception when check_violation then null; end;

  raise notice 'OK 3b: the monitor''s pay slip locks the exam they monitored';
end $$;

-- ── 4. a note on a locked session is still editable ─────────────────────────
update class_sessions set summary = 'covered fractions' where id = '00000000-0000-4000-8000-0000000000b2';
do $$ begin raise notice 'OK 4: the pastoral record stays editable after issuance'; end $$;

-- ── 5. the RECEIPT lock from 0116 survives this migration ────────────────────
insert into profiles (id, email, role, status, full_name) values
  ('00000000-0000-4000-8000-0000000000a9', 'stu@x.test', 'student', 'active', 'Sam Student');
insert into attendance (class_id, student_id, session_date, status, session_id)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a9', '2026-08-10', 'present', '00000000-0000-4000-8000-0000000000b1');
insert into receipts (id, number, student_id, student_name_snapshot, currency, subtotal, total, billing_period)
  values ('00000000-0000-4000-8000-0000000000e1', 'R-S-1', '00000000-0000-4000-8000-0000000000a9', 'Sam Student', 'INR', 0, 0, '2026-08');
update payslips set voided = true;  -- no pay slip stands in the way: only the receipt can refuse below

do $$
begin
  begin
    update class_sessions set actual_end = '2026-08-10 11:20+00' where id = '00000000-0000-4000-8000-0000000000b1';
    raise exception 'expected the receipt lock to refuse re-timing a session a billed student attended';
  exception when check_violation then null; end;

  begin
    delete from class_sessions where id = '00000000-0000-4000-8000-0000000000b1';
    raise exception 'expected the receipt lock to refuse deleting a session a billed student attended';
  exception when check_violation then null; end;

  -- A kind change alone does not change what the student was billed (a receipt counts every kind).
  update class_sessions set kind = 'demo' where id = '00000000-0000-4000-8000-0000000000b1';
  update class_sessions set kind = 'regular' where id = '00000000-0000-4000-8000-0000000000b1';
  raise notice 'OK 5: the receipt lock survives, and a kind change alone is not a billed change for a student';
end $$;

rollback;
