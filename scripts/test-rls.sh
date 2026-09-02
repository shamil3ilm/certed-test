#!/usr/bin/env bash
# ============================================================================
# RLS policy test suite - runs the row-level-security policies against REAL
# Postgres as each persona, asserting every read returns exactly the rows that
# persona should see. This is the one class of correctness mock mode CANNOT
# verify (the mock has no RLS), so it is checked here against the migration
# schema with a Supabase-shaped auth context.
#
# Usage:  bash scripts/test-rls.sh
# Requires: local Postgres (psql on PATH), superuser `postgres`, empty password.
# ============================================================================
set -uo pipefail
export PGPASSWORD="${PGPASSWORD:-}"
HOST=127.0.0.1
USER=postgres
DB=certed_rls_test
Q() { psql -h $HOST -U $USER -d "$DB" -tAqc "$1" 2>/dev/null; }

echo "== provisioning $DB =="
psql -h $HOST -U $USER -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1

# Supabase-shaped auth: auth.uid() reads the JWT-claims GUC; anon/authenticated/service_role roles.
psql -h $HOST -U $USER -d "$DB" -q >/dev/null 2>&1 <<'SQL'
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
SQL

echo "== applying migrations =="
for f in supabase/migrations/00*.sql; do
  if ! psql -h $HOST -U $USER -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/tmp/_rlsmig 2>&1; then
    echo "MIGRATION FAILED: $f"; head -3 /tmp/_rlsmig; exit 1
  fi
done
# Supabase default grants: authenticated/anon can reach tables; RLS then narrows.
psql -h $HOST -U $USER -d "$DB" -q >/dev/null 2>&1 -c "grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;"

echo "== seeding fixture =="
psql -h $HOST -U $USER -d "$DB" -q -v ON_ERROR_STOP=1 >/tmp/_rlsseed 2>&1 <<'SQL' || { echo "SEED FAILED"; cat /tmp/_rlsseed; exit 1; }
-- profiles (auth_user_id = profile id, so jwt sub = profile id)
insert into auth.users(id,email) select id, email from (values
 ('a0000000-0000-4000-8000-000000000001'::uuid,'admin@x'),
 ('a0000000-0000-4000-8000-000000000002','subadmin@x'),
 ('a0000000-0000-4000-8000-000000000010','t1@x'),
 ('a0000000-0000-4000-8000-000000000011','t2@x'),
 ('a0000000-0000-4000-8000-000000000020','m@x'),
 ('a0000000-0000-4000-8000-000000000030','s1@x'),
 ('a0000000-0000-4000-8000-000000000031','s2@x'),
 ('a0000000-0000-4000-8000-000000000032','s3@x')) v(id,email);
insert into profiles(id,auth_user_id,email,full_name,role,status) values
 ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','admin@x','Admin','admin','active'),
 ('a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','subadmin@x','SubAdmin','sub_admin','active'),
 ('a0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000010','t1@x','Tutor1','tutor','active'),
 ('a0000000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000011','t2@x','Tutor2','tutor','active'),
 ('a0000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000020','m@x','Mentor','mentor','active'),
 ('a0000000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000030','s1@x','Student1','student','active'),
 ('a0000000-0000-4000-8000-000000000031','a0000000-0000-4000-8000-000000000031','s2@x','Student2','student','active'),
 ('a0000000-0000-4000-8000-000000000032','a0000000-0000-4000-8000-000000000032','s3@x','Student3','student','active');
-- personas (global, one per role) + scoped mentor persona for mentor->s1
insert into persona_assignments(profile_id,persona_name,scope_type,scope_id,status) values
 ('a0000000-0000-4000-8000-000000000001','admin','global',null,'active'),
 ('a0000000-0000-4000-8000-000000000002','sub_admin','global',null,'active'),
 ('a0000000-0000-4000-8000-000000000010','tutor','global',null,'active'),
 ('a0000000-0000-4000-8000-000000000011','tutor','global',null,'active'),
 ('a0000000-0000-4000-8000-000000000020','mentor','global',null,'active'),
 ('a0000000-0000-4000-8000-000000000030','student','global',null,'active'),
 ('a0000000-0000-4000-8000-000000000031','student','global',null,'active'),
 ('a0000000-0000-4000-8000-000000000032','student','global',null,'active'),
 ('a0000000-0000-4000-8000-000000000020','mentor','student','a0000000-0000-4000-8000-000000000030','active');
-- classes, tutors, enrolments: c1 (t1; s1,s2), c2 (t2; s3)
insert into classes(id,name,status) values
 ('c0000000-0000-4000-8000-000000000001','C1','active'),
 ('c0000000-0000-4000-8000-000000000002','C2','active');
insert into class_tutors(tutor_id,class_id,active) values
 ('a0000000-0000-4000-8000-000000000010','c0000000-0000-4000-8000-000000000001',true),
 ('a0000000-0000-4000-8000-000000000011','c0000000-0000-4000-8000-000000000002',true);
-- 0052: a class holds at most one ACTIVE student, so each class gets one. S2 is
-- intentionally left UNENROLLED - it exists only to prove profile-scoped isolation
-- (reminders / notifications / messages / personas), which needs no class.
insert into enrollments(student_id,class_id,active) values
 ('a0000000-0000-4000-8000-000000000030','c0000000-0000-4000-8000-000000000001',true),
 ('a0000000-0000-4000-8000-000000000032','c0000000-0000-4000-8000-000000000002',true);
insert into mentorships(mentor_id,student_id,active) values
 ('a0000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000030',true);
-- One assignment + one submission PER CLASS (0052: one student per class). S1's
-- submission lives in C1, S3's in C2, so cross-student isolation is now the
-- CROSS-CLASS case - the only student-vs-student leak the model still allows.
insert into assignments(id,class_id,title,due_date,status) values
 ('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','A1','2999-01-01T00:00:00Z','active'),
 ('d0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','A2','2999-01-01T00:00:00Z','active');
alter table submissions disable trigger trg_submission_status;
insert into submissions(id,assignment_id,student_id,status,submitted_at,is_active) values
 ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000030','submitted',now(),true),
 ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000032','submitted',now(),true);
alter table submissions enable trigger trg_submission_status;
-- announcements: class c1 + global
insert into announcements(id,class_id,title,message,status) values
 ('f0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','AnnC1','x','active'),
 ('f0000000-0000-4000-8000-000000000002',null,'AnnGlobal','x','active');
-- one C1 calendar event (created by T1) to test the 0082 DELETE verb-split
insert into calendar_events(id,title,event_date,class_id,created_by) values
 ('ce000000-0000-4000-8000-000000000001','Evt','2999-01-01','c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000010');
-- R-05: two C1 sessions; S1 attended only the 2999 one (a reused class, prior occupant's
-- feedback on 2998). A student must read only sessions they attended, staff read both.
insert into class_sessions(id,class_id,session_date,student_feedback) values
 ('c5000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','2999-01-01','attended-fb'),
 ('c5000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','2998-01-01','prior-occupant-fb');
insert into attendance(class_id,student_id,session_date,status,marked_by) values
 ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000030','2999-01-01','present','a0000000-0000-4000-8000-000000000010');
-- attachments (0057): one on S1's submission (C1), one on the C1 announcement, plus
-- a PENDING row that proves only 'active' attachments are ever readable.
insert into attachments(id,submission_id,uploaded_by,original_filename,mime_type,file_size,storage_provider,drive_file_id,status) values
 ('aa000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000030','sub.pdf','application/pdf',10,'google_drive','drivefile-sub','active'),
 ('aa000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000030','pending.pdf','application/pdf',10,'google_drive',null,'pending');
insert into attachments(id,announcement_id,uploaded_by,original_filename,mime_type,file_size,storage_provider,drive_file_id,status) values
 ('aa000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000010','ann.pdf','application/pdf',10,'google_drive','drivefile-ann','active');
-- reminders + notifications (one per relevant profile)
insert into reminders(user_id,title,remind_at,is_sent) values
 ('a0000000-0000-4000-8000-000000000030','r1',now(),false),
 ('a0000000-0000-4000-8000-000000000031','r2',now(),false);
-- assigned reminders (0086): T1 (tutor of C1) sets a reminder ON S1 (enrolled in C1).
insert into reminders(user_id,created_by,class_id,title,remind_at,is_sent,completed_at) values
 ('a0000000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000010','c0000000-0000-4000-8000-000000000001','assigned-open',now(),false,null),
 ('a0000000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000010','c0000000-0000-4000-8000-000000000001','assigned-done',now(),true,now());
insert into notifications(profile_id,kind,title) values
 ('a0000000-0000-4000-8000-000000000030','grade','n1'),
 ('a0000000-0000-4000-8000-000000000031','grade','n2');
-- direct conversation t1<->s1 with a message
insert into conversations(id,kind,created_by) values
 ('b0000000-0000-4000-8000-000000000001','direct','a0000000-0000-4000-8000-000000000010');
insert into conversation_participants(conversation_id,profile_id) values
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000010'),
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000030');
insert into messages(conversation_id,sender_id,body) values
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000010','hi');
-- capability override on tutor1
insert into capability_overrides(profile_id,capability,effect,scope_type,scope_id,status,created_by) values
 ('a0000000-0000-4000-8000-000000000010','viewFinance','allow','global',null,'active','a0000000-0000-4000-8000-000000000001');
-- guardians for S1 (student contact PII; guardians_read = active admin OR the student).
insert into guardians(student_id,name,relationship,is_primary) values
 ('a0000000-0000-4000-8000-000000000030','Priya Parent','mother',true),
 ('a0000000-0000-4000-8000-000000000030','Raj Parent','father',false);
-- mentee_notes for S1 (mentor's pastoral PII; read = active admin OR the student's mentor).
insert into mentee_notes(student_id,author_id,body) values
 ('a0000000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000020','Pastoral note for S1');
-- financial system-of-record: a receipt FOR student S1 and a payslip FOR tutor T1.
-- Read policy = active admin OR the party the document is for; nobody else.
insert into receipts(number,student_id,student_name_snapshot,currency,subtotal,total,created_by) values
 ('CEA-R-TEST-0001','a0000000-0000-4000-8000-000000000030','S One','INR',600,600,'a0000000-0000-4000-8000-000000000001');
insert into receipt_lines(receipt_id,subject,hours,rate,amount)
 select id,'Maths',1,600,600 from receipts where number='CEA-R-TEST-0001';
insert into payslips(number,tutor_id,tutor_name_snapshot,currency,subtotal,total,created_by) values
 ('CEA-P-TEST-0001','a0000000-0000-4000-8000-000000000010','T One','INR',500,500,'a0000000-0000-4000-8000-000000000001');
insert into payslip_lines(payslip_id,label,hours,rate,amount)
 select id,'Teaching',1,500,500 from payslips where number='CEA-P-TEST-0001';
-- org_settings single row (org_read = active admin only).
insert into org_settings(id) values (true) on conflict do nothing;
SQL

pass=0; fail=0
# check LABEL UID SQL EXPECTED
check() {
  local label="$1" uid="$2" sql="$3" want="$4"
  local got
  got=$(Q "set role authenticated; set request.jwt.claims='{\"sub\":\"$uid\"}'; $sql")
  if [ "$got" = "$want" ]; then pass=$((pass+1)); # echo "  ok  $label";
  else fail=$((fail+1)); echo "  FAIL $label : expected $want, got ${got:-<none>}"; fi
}
# check_write LABEL UID SQL EXPECT(allow|block) - runs a WRITE in a rolled-back
# transaction (so it never mutates the fixture) and asserts whether RLS permitted it.
# "block" = the write raised a row-level-security / permission-denied error.
check_write() {
  local label="$1" uid="$2" sql="$3" expect="$4"
  local out got
  out=$(psql -h $HOST -U $USER -d "$DB" -tAqc \
    "set role authenticated; set request.jwt.claims='{\"sub\":\"$uid\"}'; begin; $sql; rollback;" 2>&1)
  if echo "$out" | grep -qiE "row-level security|permission denied"; then got=block; else got=allow; fi
  if [ "$got" = "$expect" ]; then pass=$((pass+1));
  else fail=$((fail+1)); echo "  FAIL $label : expected $expect, got $got ${out:+- $out}"; fi
}
# check_guard LABEL UID SQL EXPECT(allow|block) - like check_write but "block" also
# covers a BEFORE-trigger raising a plpgsql exception (e.g. the assigned-reminder guard),
# which is not an RLS/permission-denied error. Rolled back, so it never mutates.
check_guard() {
  local label="$1" uid="$2" sql="$3" expect="$4" out got
  out=$(psql -h $HOST -U $USER -d "$DB" -tAqc \
    "set role authenticated; set request.jwt.claims='{\"sub\":\"$uid\"}'; begin; $sql; rollback;" 2>&1)
  if echo "$out" | grep -qiE "row-level security|permission denied|assignee may|violates"; then got=block; else got=allow; fi
  if [ "$got" = "$expect" ]; then pass=$((pass+1));
  else fail=$((fail+1)); echo "  FAIL $label : expected $expect, got $got ${out:+- $out}"; fi
}
# check_rows LABEL UID SQL WANT - runs a statement in a ROLLED-BACK tx and asserts the
# scalar it returns (used to count rows a filtered DELETE/UPDATE actually affects, since
# RLS silently filters them to 0 with no error).
check_rows() {
  local label="$1" uid="$2" sql="$3" want="$4" got
  got=$(psql -h $HOST -U $USER -d "$DB" -tAqc \
    "set role authenticated; set request.jwt.claims='{\"sub\":\"$uid\"}'; begin; $sql; rollback;" 2>/dev/null | tr -d '[:space:]')
  if [ "$got" = "$want" ]; then pass=$((pass+1));
  else fail=$((fail+1)); echo "  FAIL $label : expected $want, got ${got:-<none>}"; fi
}
A=a0000000-0000-4000-8000-000000000001   # admin
T1=a0000000-0000-4000-8000-000000000010; T2=a0000000-0000-4000-8000-000000000011
M=a0000000-0000-4000-8000-000000000020
S1=a0000000-0000-4000-8000-000000000030; S2=a0000000-0000-4000-8000-000000000031; S3=a0000000-0000-4000-8000-000000000032
C1=c0000000-0000-4000-8000-000000000001   # class C1: tutor T1, enrolled S1, mentored by M
C2=c0000000-0000-4000-8000-000000000002   # class C2: tutor T2, enrolled S3 - M mentors nobody here

echo "== running RLS assertions =="
# reminders: self only
check "reminders: S1 sees own personal"        $S1 "select count(*) from reminders where title='r1'" 1
check "reminders: S1 cannot see S2's"          $S1 "select count(*) from reminders where title='r2'" 0
# assigned reminders (0086): T1 assigns ON S1 in class C1
# visibility: assignee + creator + the class mentor see it; an unrelated student/tutor does not
check "assigned: S1 (assignee) sees open"      $S1 "select count(*) from reminders where title='assigned-open'" 1
check "assigned: T1 (creator) sees open"       $T1 "select count(*) from reminders where title='assigned-open'" 1
# only the creator + assignee see an assigned reminder - a mentor does NOT see another
# creator's (the tutor's) reminder to a shared mentee (each creator manages their own)
check "assigned: M (not creator) can't see"    $M  "select count(*) from reminders where title='assigned-open'" 0
check "assigned: S2 cannot see it"             $S2 "select count(*) from reminders where title='assigned-open'" 0
check "assigned: T2 cannot see it"             $T2 "select count(*) from reminders where title='assigned-open'" 0
# assignee (student) may ONLY mark done - not edit, not reopen, not delete
check_write "assigned: S1 marks open done"     $S1 "update reminders set is_sent=true,completed_at=now() where title='assigned-open'" allow
check_guard "assigned: S1 cannot edit title"   $S1 "update reminders set title='hacked' where title='assigned-open'" block
check_guard "assigned: S1 cannot edit deadline" $S1 "update reminders set remind_at=now()+interval '1 day' where title='assigned-open'" block
check_guard "assigned: S1 cannot reopen done"  $S1 "update reminders set is_sent=false where title='assigned-done'" block
check_rows "assigned: S1 delete affects 0"     $S1 "with d as (delete from reminders where title='assigned-open' returning 1) select count(*) from d" 0
# creator (tutor) keeps full control
check_write "assigned: T1 edits it"            $T1 "update reminders set title='edited' where title='assigned-open'" allow
check_rows "assigned: T1 delete affects 1"     $T1 "with d as (delete from reminders where title='assigned-open' returning 1) select count(*) from d" 1
# insert authority: a tutor may assign into a class they teach, not one they don't
check_write "assigned: T1 assigns into C1"     $T1 "insert into reminders(user_id,created_by,class_id,title,remind_at) values('$S1','$T1','$C1','x',now())" allow
check_write "assigned: T2 cannot assign to S1" $T2 "insert into reminders(user_id,created_by,class_id,title,remind_at) values('$S1','$T2','$C1','x',now())" block
# notifications: self only
check "notifications: S1 sees own"             $S1 "select count(*) from notifications" 1
check "notifications: S2 cannot see S1's"      $S2 "select count(*) from notifications where title='n1'" 0
# submissions (0052 makes this CROSS-class: S1 in C1, S3 in C2): a student sees
# only their own, a tutor only their class's, a mentor only their mentee's.
check "submissions: S1 sees own"               $S1 "select count(*) from submissions where student_id='$S1'" 1
check "submissions: S1 cannot see S3's (C2)"   $S1 "select count(*) from submissions where student_id='$S3'" 0
check "submissions: T1 sees only C1's"         $T1 "select count(*) from submissions" 1
check "submissions: T2 sees only C2's"         $T2 "select count(*) from submissions" 1
check "submissions: T2 cannot see C1's"        $T2 "select count(*) from submissions where student_id='$S1'" 0
check "submissions: mentor sees mentee S1"     $M  "select count(*) from submissions where student_id='$S1'" 1
check "submissions: mentor cannot see S3"      $M  "select count(*) from submissions where student_id='$S3'" 0
# announcements: class + global
check "announcements: S1 sees class C1"        $S1 "select count(*) from announcements where title='AnnC1'" 1
check "announcements: S1 sees global"          $S1 "select count(*) from announcements where title='AnnGlobal'" 1
check "announcements: S3 cannot see C1's"      $S3 "select count(*) from announcements where title='AnnC1'" 0
check "announcements: S3 still sees global"    $S3 "select count(*) from announcements where title='AnnGlobal'" 1
# attachments (0057): visibility MIRRORS each owner's read policy exactly.
SUBID=e0000000-0000-4000-8000-000000000001; ANNID=f0000000-0000-4000-8000-000000000001
check "attachments: S1 sees own submission's"  $S1 "select count(*) from attachments where submission_id='$SUBID'" 1
check "attachments: pending is invisible"      $S1 "select count(*) from attachments where id='aa000000-0000-4000-8000-000000000003'" 0
check "attachments: S3 cannot see S1 sub's"    $S3 "select count(*) from attachments where submission_id='$SUBID'" 0
check "attachments: T1 sees C1 submission's"   $T1 "select count(*) from attachments where submission_id='$SUBID'" 1
check "attachments: T2 cannot see C1 sub's"    $T2 "select count(*) from attachments where submission_id='$SUBID'" 0
check "attachments: mentor sees mentee sub's"  $M  "select count(*) from attachments where submission_id='$SUBID'" 1
check "attachments: S1 sees C1 announcement's" $S1 "select count(*) from attachments where announcement_id='$ANNID'" 1
check "attachments: S3 cannot see C1 ann's"    $S3 "select count(*) from attachments where announcement_id='$ANNID'" 0
# messages/conversations: participant only
check "messages: T1 (participant) sees msg"    $T1 "select count(*) from messages" 1
check "messages: S1 (participant) sees msg"    $S1 "select count(*) from messages" 1
check "messages: S2 (non-participant) sees 0"  $S2 "select count(*) from messages" 0
check "conversations: S2 sees none"            $S2 "select count(*) from conversations" 0
# persona_assignments: self + admin
check "personas: S1 sees own"                  $S1 "select count(*) from persona_assignments where profile_id='$S1'" 1
check "personas: S1 cannot see S2's"           $S1 "select count(*) from persona_assignments where profile_id='$S2'" 0
check "personas: admin sees all"               $A  "select count(*) from persona_assignments" 9
# capability_overrides: self + admin
check "overrides: T1 sees own"                 $T1 "select count(*) from capability_overrides where profile_id='$T1'" 1
check "overrides: S1 cannot see T1's"          $S1 "select count(*) from capability_overrides" 0
check "overrides: admin sees all"              $A  "select count(*) from capability_overrides" 1
# guardians (0076): student contact PII - visible to an active admin and the student
# THEMSELVES only (staff read via the service role, not RLS).
check "guardians: admin sees S1's"             $A  "select count(*) from guardians where student_id='$S1'" 2
check "guardians: S1 sees own"                 $S1 "select count(*) from guardians where student_id='$S1'" 2
check "guardians: S2 cannot see S1's"          $S2 "select count(*) from guardians where student_id='$S1'" 0
check "guardians: tutor cannot see S1's"       $T1 "select count(*) from guardians where student_id='$S1'" 0
# mentee_notes (0078): mentor's pastoral PII - read by an active admin OR the student's
# mentor(s); NEVER the student, and not a plain tutor. Writes are service-role only.
check "mentee_notes: admin sees S1's"          $A  "select count(*) from mentee_notes where student_id='$S1'" 1
check "mentee_notes: mentor sees mentee S1's"  $M  "select count(*) from mentee_notes where student_id='$S1'" 1
check "mentee_notes: student cannot see own"   $S1 "select count(*) from mentee_notes where student_id='$S1'" 0
check "mentee_notes: tutor cannot see S1's"    $T1 "select count(*) from mentee_notes where student_id='$S1'" 0
# subjects (0064): any ACTIVE user reads all; writes are service-role only.
check "subjects: active student sees all"      $S1 "select count(*) from subjects" 10
check "subjects: active tutor sees all"        $T1 "select count(*) from subjects" 10
# receipts/payslips (financial system-of-record): active admin, plus the party the
# document is FOR (the student on a receipt, the teacher on a payslip). Nobody else.
check "receipts: admin sees"                   $A  "select count(*) from receipts" 1
check "receipts: S1 sees own"                  $S1 "select count(*) from receipts where student_id='$S1'" 1
check "receipts: S2 cannot see"                $S2 "select count(*) from receipts" 0
check "receipt_lines: admin sees"              $A  "select count(*) from receipt_lines" 1
check "receipt_lines: S1 sees own"             $S1 "select count(*) from receipt_lines" 1
check "receipt_lines: S2 cannot see"           $S2 "select count(*) from receipt_lines" 0
check "payslips: admin sees"                   $A  "select count(*) from payslips" 1
check "payslips: T1 sees own"                  $T1 "select count(*) from payslips where tutor_id='$T1'" 1
check "payslips: T2 cannot see"                $T2 "select count(*) from payslips" 0
check "payslip_lines: admin sees"              $A  "select count(*) from payslip_lines" 1
check "payslip_lines: T1 sees own"             $T1 "select count(*) from payslip_lines" 1
check "payslip_lines: T2 cannot see"           $T2 "select count(*) from payslip_lines" 0
# org_settings: admin-only read (org_read = is_active_admin()).
check "org_settings: admin sees"               $A  "select count(*) from org_settings" 1
check "org_settings: non-admin sees 0"         $S1 "select count(*) from org_settings" 0
# profiles: self visible
check "profiles: S1 sees own row"              $S1 "select count(*) from profiles where id='$S1'" 1

# ── Mentor write scope: attendance + own-mentee CALENDAR; content stays tutor-only ─
# M holds only a student-scoped mentor persona over S1 (enrolled in C1). A mentor READS
# the mentee's class but must NOT author its CONTENT - before 0079 these INSERTs succeeded
# through teaches_class(). The tutor of C1 must still be able to. A mentor CAN write
# attendance (manageAttendance) and, since 0082, the CALENDAR for a mentee's class - but
# not for a class they don't mentor (C2) nor a global event.
check_write "A-07: mentor CANNOT insert assignment in mentee class" $M \
  "insert into assignments(class_id,title,due_date,status) values ('$C1','hack',now(),'active')" block
check_write "A-07: mentor CANNOT insert resource in mentee class" $M \
  "insert into resources(class_id,title,status) values ('$C1','hack','active')" block
check_write "A-07: mentor CANNOT insert announcement in mentee class" $M \
  "insert into announcements(class_id,title,message,status) values ('$C1','hack','x','active')" block
check_write "A-07: tutor CAN still insert assignment in own class" $T1 \
  "insert into assignments(class_id,title,due_date,status) values ('$C1','real',now(),'active')" allow
check_write "A-07: mentor CAN still write attendance (manageAttendance)" $M \
  "insert into attendance(class_id,student_id,session_date,status,marked_by) values ('$C1','$S1','2999-01-01','present','$M')" allow
check_write "0082: mentor CAN create a calendar event for a mentee class" $M \
  "insert into calendar_events(title,event_date,class_id,created_by) values ('mentoring','2999-01-01','$C1','$M')" allow
check_write "0082: mentor CANNOT create an event for a non-mentee class" $M \
  "insert into calendar_events(title,event_date,class_id,created_by) values ('x','2999-01-01','$C2','$M')" block
check_write "0082: mentor CANNOT create a GLOBAL calendar event" $M \
  "insert into calendar_events(title,event_date,class_id,created_by) values ('g','2999-01-01',null,'$M')" block
# 0082 verb-split: a mentor may INSERT/UPDATE but must NOT DELETE (destroy the tutor's calendar).
# RLS filters DELETE rows via USING, so a blocked delete affects 0 rows (no error). Mentor runs
# first (deletes nothing), so the row survives for the tutor's delete.
CE=ce000000-0000-4000-8000-000000000001
check "0082: mentor DELETE of a calendar event affects 0 rows" $M \
  "with d as (delete from calendar_events where id='$CE' returning 1) select count(*) from d" 0
check "0082: tutor DELETE of their class's event affects 1 row" $T1 \
  "with d as (delete from calendar_events where id='$CE' returning 1) select count(*) from d" 1
# R-05: a student reads only class_sessions they ATTENDED (not a prior occupant's), staff read all.
check "R-05: S1 reads a session they attended"             $S1 "select count(*) from class_sessions where session_date='2999-01-01'" 1
check "R-05: S1 CANNOT read a C1 session they did not attend" $S1 "select count(*) from class_sessions where session_date='2998-01-01'" 0
check "R-05: tutor reads both C1 sessions"                 $T1 "select count(*) from class_sessions where class_id='$C1'" 2
# mentee_notes has no write policy: even the student's mentor cannot INSERT via the API
# (notes are written service-role only, gated in-app by canMentor).
check_write "mentee_notes: mentor CANNOT insert via API (service-role only)" $M \
  "insert into mentee_notes(student_id,author_id,body) values ('$S1','$M','x')" block

echo "== RLS RESULT: $pass passed, $fail failed =="
psql -h $HOST -U $USER -q -c "drop database if exists $DB" >/dev/null 2>&1
[ $fail -eq 0 ]
