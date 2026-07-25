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
insert into enrollments(student_id,class_id,active) values
 ('a0000000-0000-4000-8000-000000000030','c0000000-0000-4000-8000-000000000001',true),
 ('a0000000-0000-4000-8000-000000000031','c0000000-0000-4000-8000-000000000001',true),
 ('a0000000-0000-4000-8000-000000000032','c0000000-0000-4000-8000-000000000002',true);
insert into mentorships(mentor_id,student_id,active) values
 ('a0000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000030',true);
-- assignment in c1 + two submissions (s1, s2)
insert into assignments(id,class_id,title,due_date,status) values
 ('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','A1','2999-01-01T00:00:00Z','active');
alter table submissions disable trigger trg_submission_status;
insert into submissions(id,assignment_id,student_id,status,submitted_at,is_active) values
 ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000030','submitted',now(),true),
 ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000031','submitted',now(),true);
alter table submissions enable trigger trg_submission_status;
-- announcements: class c1 + global
insert into announcements(id,class_id,title,message,status) values
 ('f0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','AnnC1','x','active'),
 ('f0000000-0000-4000-8000-000000000002',null,'AnnGlobal','x','active');
-- reminders + notifications (one per relevant profile)
insert into reminders(user_id,title,remind_at,is_sent) values
 ('a0000000-0000-4000-8000-000000000030','r1',now(),false),
 ('a0000000-0000-4000-8000-000000000031','r2',now(),false);
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
A=a0000000-0000-4000-8000-000000000001   # admin
T1=a0000000-0000-4000-8000-000000000010; T2=a0000000-0000-4000-8000-000000000011
M=a0000000-0000-4000-8000-000000000020
S1=a0000000-0000-4000-8000-000000000030; S2=a0000000-0000-4000-8000-000000000031; S3=a0000000-0000-4000-8000-000000000032

echo "== running RLS assertions =="
# reminders: self only
check "reminders: S1 sees own"                 $S1 "select count(*) from reminders" 1
check "reminders: S1 cannot see S2's"          $S1 "select count(*) from reminders where title='r2'" 0
# notifications: self only
check "notifications: S1 sees own"             $S1 "select count(*) from notifications" 1
check "notifications: S2 cannot see S1's"      $S2 "select count(*) from notifications where title='n1'" 0
# submissions: student own / tutor-of-class / mentor-of-student
check "submissions: S1 sees own"               $S1 "select count(*) from submissions where student_id='$S1'" 1
check "submissions: S1 cannot see S2's"        $S1 "select count(*) from submissions where student_id='$S2'" 0
check "submissions: T1 sees both in C1"        $T1 "select count(*) from submissions" 2
check "submissions: T2 sees none of C1"        $T2 "select count(*) from submissions" 0
check "submissions: mentor sees mentee S1"     $M  "select count(*) from submissions where student_id='$S1'" 1
check "submissions: mentor cannot see S2"      $M  "select count(*) from submissions where student_id='$S2'" 0
# announcements: class + global
check "announcements: S1 sees class C1"        $S1 "select count(*) from announcements where title='AnnC1'" 1
check "announcements: S1 sees global"          $S1 "select count(*) from announcements where title='AnnGlobal'" 1
check "announcements: S3 cannot see C1's"      $S3 "select count(*) from announcements where title='AnnC1'" 0
check "announcements: S3 still sees global"    $S3 "select count(*) from announcements where title='AnnGlobal'" 1
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
# profiles: self visible
check "profiles: S1 sees own row"              $S1 "select count(*) from profiles where id='$S1'" 1

echo "== RLS RESULT: $pass passed, $fail failed =="
psql -h $HOST -U $USER -q -c "drop database if exists $DB" >/dev/null 2>&1
[ $fail -eq 0 ]
