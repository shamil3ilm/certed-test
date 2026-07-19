-- Canonical fresh-build snapshot for Cert-Ed Academia.
--
-- AUTHORITY MODEL (see supabase/README.md):
-- - supabase/migrations/*.sql is the SOURCE OF TRUTH and the upgrade path for
--   any existing environment.
-- - THIS FILE is a derived snapshot: the end state of applying 0001..NNNN in
--   one run, for standing up a brand-new database. It must be kept in sync with
--   migrations; do not hand-edit schema here independently of a migration.
--
-- Identity model (settled, not transitional):
-- - profiles.role is the account's FIXED identity (admin / sub_admin / tutor /
--   student), set at account creation.
-- - persona_assignments is the AUTHORIZATION model. Global personas are kept in
--   sync with profiles.role by trigger; scoped personas (e.g. mentor-for-student)
--   come from their own tables (mentorships).
-- - RLS and helper functions use profiles.id as the domain identity and auth.uid()
--   only as the authentication identity.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------

create type user_role as enum ('admin', 'sub_admin', 'tutor', 'student');
create type user_status as enum ('active', 'pending', 'disabled');
create type calendar_event_kind as enum ('event', 'holiday', 'cancellation', 'reschedule');
create type persona_name as enum (
  'admin',
  'sub_admin',
  'tutor',
  'mentor',
  'student',
  'guardian',
  'finance_operator',
  'assistant',
  'executive'
);
create type persona_scope_type as enum ('global', 'class', 'student', 'finance', 'reporting');

-- -----------------------------------------------------------------------------
-- Core identity and organization
-- -----------------------------------------------------------------------------

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text unique not null check (email = lower(btrim(email))),
  full_name text,
  role user_role not null default 'student',
  status user_status not null default 'pending',
  class_level text,
  setup_code_hash text,
  setup_code_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table org_settings (
  id boolean primary key default true,
  institute_name text not null default 'Cert-Ed Academia',
  contact_email text,
  contact_phone text,
  bank_account text,
  bank_ifsc text,
  bank_branch text,
  terms_text text,
  signatory_name text,
  signatory_title text,
  signature_mode text not null default 'text',
  signature_text text default 'Digitally signed',
  default_currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  receipt_prefix text not null default 'CEA-R',
  payslip_prefix text not null default 'CEA-P',
  constraint org_settings_single_row check (id),
  constraint org_settings_signature_mode_check check (signature_mode in ('text', 'image')),
  constraint org_settings_currency_upper_check check (default_currency = upper(default_currency) and char_length(default_currency) = 3),
  constraint org_settings_receipt_prefix_check check (char_length(btrim(receipt_prefix)) > 0),
  constraint org_settings_payslip_prefix_check check (char_length(btrim(payslip_prefix)) > 0)
);

insert into org_settings (id) values (true) on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Personas and access metadata
-- -----------------------------------------------------------------------------

create table persona_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  persona_name persona_name not null,
  scope_type persona_scope_type not null default 'global',
  scope_id uuid,
  scope_key text generated always as (coalesce(scope_id::text, 'global')) stored,
  status text not null default 'active' check (status in ('active', 'inactive')),
  assigned_at timestamptz not null default now(),
  constraint persona_scope_consistency check (
    (scope_type = 'global' and scope_id is null) or
    (scope_type <> 'global' and scope_id is not null)
  ),
  constraint persona_assignments_unique_scope unique (profile_id, persona_name, scope_type, scope_key)
);

create index idx_persona_assignments_profile_id on persona_assignments(profile_id);
create index idx_persona_assignments_persona_name on persona_assignments(persona_name);
create index idx_persona_assignments_scope on persona_assignments(scope_type, scope_id) where scope_id is not null;
create index idx_persona_assignments_status on persona_assignments(status);
create index idx_persona_assignments_active on persona_assignments(profile_id, persona_name) where status = 'active';

comment on table persona_assignments is
'Authorization model: personas (global + scoped). Global personas are kept in sync with profiles.role, the account''s fixed identity; scoped personas come from their own tables (e.g. mentorships).';

-- -----------------------------------------------------------------------------
-- Academic structure and relationships
-- -----------------------------------------------------------------------------

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (student_id, class_id)
);
create index enrollments_class_idx on enrollments(class_id, active);
create index enrollments_student_idx on enrollments(student_id, active);

create table class_tutors (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tutor_id, class_id)
);
create index class_tutors_class_idx on class_tutors(class_id, active);
create index class_tutors_tutor_idx on class_tutors(tutor_id, active);

create table mentorships (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tutor_id, student_id)
);
create index mentorships_tutor_idx on mentorships(tutor_id, active);
create index mentorships_student_idx on mentorships(student_id, active);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Content and collaboration
-- -----------------------------------------------------------------------------

create table announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete cascade,
  title text not null,
  message text not null,
  author_id uuid references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index announcements_class_created_idx on announcements(class_id, created_at desc);

create table resources (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  drive_link text,
  uploaded_by uuid references profiles(id) on delete set null,
  topic text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index resources_class_idx on resources(class_id);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz not null,
  attachment_drive_link text,
  topic text,
  max_marks numeric(6,2) check (max_marks is null or max_marks >= 0),
  created_by uuid references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index assignments_class_idx on assignments(class_id);
create index assignments_status_due_idx on assignments(status, due_date);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  drive_link text,
  file_name text,
  status text not null check (status in ('submitted', 'late')),
  score numeric(6,2) check (score is null or score >= 0),
  feedback text,
  graded_at timestamptz,
  graded_by uuid references profiles(id) on delete set null,
  submitted_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index submissions_one_active on submissions(assignment_id, student_id) where is_active;
create index submissions_student_idx on submissions(student_id, is_active);

create table meet_links (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete cascade,
  title text not null,
  url text not null,
  description text,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index meet_links_class_idx on meet_links(class_id);

create table comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('submission', 'resource', 'meet')),
  entity_id uuid not null,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index comments_entity_idx on comments(entity_type, entity_id, created_at);

-- -----------------------------------------------------------------------------
-- Calendar and attendance
-- -----------------------------------------------------------------------------

create table timetable_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject text not null,
  tutor_id uuid references profiles(id) on delete set null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  mode_or_location text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint timetable_slots_time_order check (end_time > start_time)
);
create index timetable_slots_class_idx on timetable_slots(class_id);
create index timetable_slots_active_idx on timetable_slots(active);

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date not null,
  start_time time,
  end_time time,
  class_id uuid references classes(id) on delete cascade,
  kind calendar_event_kind not null default 'event',
  slot_id uuid references timetable_slots(id) on delete set null,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index calendar_events_class_idx on calendar_events(class_id);
create index calendar_events_date_idx on calendar_events(event_date);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  session_date date not null,
  status text not null check (status in ('present', 'absent', 'late')),
  marked_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, student_id, session_date)
);
create index attendance_class_date_idx on attendance(class_id, session_date);
create index attendance_student_idx on attendance(student_id, session_date desc);

-- -----------------------------------------------------------------------------
-- Finance
-- -----------------------------------------------------------------------------

create table receipts (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  student_id uuid references profiles(id) on delete set null,
  student_name_snapshot text not null,
  class_snapshot text,
  issue_date date not null default current_date,
  currency text not null check (currency = upper(currency) and char_length(currency) = 3),
  note text,
  subtotal numeric(16,3) not null check (subtotal >= 0),
  discount numeric(16,3) check (discount is null or discount >= 0),
  total numeric(16,3) not null check (total >= 0),
  voided boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint receipts_total_check check (total = subtotal - coalesce(discount, 0)),
  constraint receipts_discount_check check (coalesce(discount, 0) <= subtotal)
);
create index receipts_student_idx on receipts(student_id);
create index receipts_created_idx on receipts(created_at desc);

create table receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  subject text not null,
  hours numeric(8,2) not null check (hours >= 0),
  rate numeric(16,3) not null check (rate >= 0),
  amount numeric(16,3) not null check (amount >= 0)
);
create index receipt_lines_receipt_idx on receipt_lines(receipt_id);

create table payslips (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  tutor_id uuid references profiles(id) on delete set null,
  tutor_name_snapshot text not null,
  issue_date date not null default current_date,
  currency text not null check (currency = upper(currency) and char_length(currency) = 3),
  note text,
  subtotal numeric(16,3) not null check (subtotal >= 0),
  discount numeric(16,3) check (discount is null or discount >= 0),
  total numeric(16,3) not null check (total >= 0),
  voided boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payslips_total_check check (total = subtotal - coalesce(discount, 0)),
  constraint payslips_discount_check check (coalesce(discount, 0) <= subtotal)
);
create index payslips_tutor_idx on payslips(tutor_id);
create index payslips_created_idx on payslips(created_at desc);

create table payslip_lines (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references payslips(id) on delete cascade,
  label text not null,
  hours numeric(8,2) not null check (hours >= 0),
  rate numeric(16,3) not null check (rate >= 0),
  amount numeric(16,3) not null check (amount >= 0)
);
create index payslip_lines_payslip_idx on payslip_lines(payslip_id);

create table document_counters (
  doc_type text not null,
  year int not null,
  last_number int not null default 0 check (last_number >= 0),
  primary key (doc_type, year)
);

-- -----------------------------------------------------------------------------
-- Personal reminders
-- -----------------------------------------------------------------------------

create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  remind_at timestamptz not null,
  is_sent boolean not null default false,
  created_at timestamptz not null default now()
);
create index reminders_user_idx on reminders(user_id);

-- -----------------------------------------------------------------------------
-- Identity, persona, and scope helpers
-- -----------------------------------------------------------------------------

create or replace function current_profile_id() returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.id
  from profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function current_app_role() returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select p.role
  from profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function current_status() returns user_status
language sql
security definer
stable
set search_path = public
as $$
  select p.status
  from profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function profile_has_persona(
  p_profile_id uuid,
  p_persona persona_name,
  p_scope_type persona_scope_type default 'global'::persona_scope_type,
  p_scope_id uuid default null
) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1
    from persona_assignments pa
    where pa.profile_id = p_profile_id
      and pa.persona_name = p_persona
      and pa.scope_type = p_scope_type
      and (
        (p_scope_type = 'global'::persona_scope_type and pa.scope_id is null) or
        (p_scope_type <> 'global'::persona_scope_type and pa.scope_id = p_scope_id)
      )
      and pa.status = 'active'
  )
$$;

create or replace function current_profile_has_persona(
  p_persona persona_name,
  p_scope_type persona_scope_type default 'global'::persona_scope_type,
  p_scope_id uuid default null
) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select profile_has_persona(current_profile_id(), p_persona, p_scope_type, p_scope_id)
$$;

create or replace function user_has_persona(
  p_profile_id uuid,
  p_persona persona_name,
  p_scope_type persona_scope_type default 'global'::persona_scope_type,
  p_scope_id uuid default null
) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select profile_has_persona(p_profile_id, p_persona, p_scope_type, p_scope_id)
$$;

create or replace function is_active_admin() returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1
    from profiles p
    where p.id = current_profile_id()
      and p.status = 'active'
      and (
        p.role = 'admin' or
        profile_has_persona(p.id, 'admin'::persona_name)
      )
  )
$$;

create or replace function is_self_active(p_id uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1
    from profiles p
    where p.id = p_id
      and p.id = current_profile_id()
      and p.status = 'active'
  )
$$;

create or replace function is_enrolled(p_class_id uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1
    from enrollments e
    join profiles p on p.id = e.student_id
    where p.id = current_profile_id()
      and p.status = 'active'
      and e.class_id = p_class_id
      and e.active
  )
$$;

create or replace function teaches_class(p_class_id uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1
    from class_tutors ct
    join profiles p on p.id = ct.tutor_id
    where p.id = current_profile_id()
      and p.status = 'active'
      and ct.class_id = p_class_id
      and ct.active
  )
$$;

create or replace function mentors_student(p_student_id uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1
    from mentorships m
    where m.tutor_id = current_profile_id()
      and m.student_id = p_student_id
      and m.active
  )
  or current_profile_has_persona(
    'mentor'::persona_name,
    'student'::persona_scope_type,
    p_student_id
  )
$$;

create or replace function user_is_admin(p_profile_id uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select profile_has_persona(p_profile_id, 'admin'::persona_name)
$$;

create or replace function user_is_mentor_for_student(p_profile_id uuid, p_student_id uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select profile_has_persona(
    p_profile_id,
    'mentor'::persona_name,
    'student'::persona_scope_type,
    p_student_id
  )
$$;

revoke execute on function current_profile_id() from public;
grant execute on function current_profile_id() to authenticated;
grant execute on function current_profile_id() to service_role;

revoke execute on function current_app_role() from public;
grant execute on function current_app_role() to authenticated;
grant execute on function current_app_role() to service_role;

revoke execute on function current_status() from public;
grant execute on function current_status() to authenticated;
grant execute on function current_status() to service_role;

revoke execute on function profile_has_persona(uuid, persona_name, persona_scope_type, uuid) from public;
grant execute on function profile_has_persona(uuid, persona_name, persona_scope_type, uuid) to authenticated;
grant execute on function profile_has_persona(uuid, persona_name, persona_scope_type, uuid) to service_role;

revoke execute on function current_profile_has_persona(persona_name, persona_scope_type, uuid) from public;
grant execute on function current_profile_has_persona(persona_name, persona_scope_type, uuid) to authenticated;
grant execute on function current_profile_has_persona(persona_name, persona_scope_type, uuid) to service_role;

revoke execute on function user_has_persona(uuid, persona_name, persona_scope_type, uuid) from public;
grant execute on function user_has_persona(uuid, persona_name, persona_scope_type, uuid) to authenticated;
grant execute on function user_has_persona(uuid, persona_name, persona_scope_type, uuid) to service_role;

revoke execute on function is_active_admin() from public;
grant execute on function is_active_admin() to authenticated;
grant execute on function is_active_admin() to service_role;

revoke execute on function is_self_active(uuid) from public;
grant execute on function is_self_active(uuid) to authenticated;
grant execute on function is_self_active(uuid) to service_role;

revoke execute on function is_enrolled(uuid) from public;
grant execute on function is_enrolled(uuid) to authenticated;
grant execute on function is_enrolled(uuid) to service_role;

revoke execute on function teaches_class(uuid) from public;
grant execute on function teaches_class(uuid) to authenticated;
grant execute on function teaches_class(uuid) to service_role;

revoke execute on function mentors_student(uuid) from public;
grant execute on function mentors_student(uuid) to authenticated;
grant execute on function mentors_student(uuid) to service_role;

revoke execute on function user_is_admin(uuid) from public;
grant execute on function user_is_admin(uuid) to authenticated;
grant execute on function user_is_admin(uuid) to service_role;

revoke execute on function user_is_mentor_for_student(uuid, uuid) from public;
grant execute on function user_is_mentor_for_student(uuid, uuid) to authenticated;
grant execute on function user_is_mentor_for_student(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Sync triggers: keep the global persona in step with profiles.role (identity)
-- -----------------------------------------------------------------------------

create or replace function sync_profile_global_persona() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona persona_name;
  v_status text;
begin
  v_persona := case new.role
    when 'admin' then 'admin'::persona_name
    when 'sub_admin' then 'sub_admin'::persona_name
    when 'tutor' then 'tutor'::persona_name
    else 'student'::persona_name
  end;
  v_status := case when new.status = 'active' then 'active' else 'inactive' end;

  update persona_assignments
  set status = 'inactive'
  where profile_id = new.id
    and scope_type = 'global'
    and persona_name in ('admin', 'sub_admin', 'tutor', 'student')
    and persona_name <> v_persona;

  insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
  values (new.id, v_persona, 'global', null, v_status)
  on conflict (profile_id, persona_name, scope_type, scope_key)
  do update set status = excluded.status;

  return new;
end;
$$;

create trigger trg_sync_profile_global_persona
after insert or update of role, status on profiles
for each row execute function sync_profile_global_persona();

create or replace function sync_mentor_persona_from_mentorship() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update persona_assignments
    set status = 'inactive'
    where profile_id = old.tutor_id
      and persona_name = 'mentor'
      and scope_type = 'student'
      and scope_id = old.student_id;
    return old;
  end if;

  insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
  values (
    new.tutor_id,
    'mentor',
    'student',
    new.student_id,
    case when new.active then 'active' else 'inactive' end
  )
  on conflict (profile_id, persona_name, scope_type, scope_key)
  do update set status = excluded.status;

  return new;
end;
$$;

create trigger trg_sync_mentor_persona
after insert or update of active on mentorships
for each row execute function sync_mentor_persona_from_mentorship();

create trigger trg_sync_mentor_persona_delete
after delete on mentorships
for each row execute function sync_mentor_persona_from_mentorship();

-- -----------------------------------------------------------------------------
-- Finance and submission helper functions
-- -----------------------------------------------------------------------------

create or replace function next_document_number(p_doc_type text, p_year int) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into document_counters (doc_type, year, last_number)
  values (p_doc_type, p_year, 1)
  on conflict (doc_type, year)
    do update set last_number = document_counters.last_number + 1
  returning last_number into n;
  return n;
end;
$$;

create or replace function finance_totals(p_kind text)
returns table (currency text, live_total numeric, live_count bigint)
language sql
stable
as $$
  select r.currency, coalesce(sum(r.total), 0)::numeric, count(*)::bigint
  from receipts r
  where p_kind = 'receipt' and r.voided = false
  group by r.currency
  union all
  select p.currency, coalesce(sum(p.total), 0)::numeric, count(*)::bigint
  from payslips p
  where p_kind = 'payslip' and p.voided = false
  group by p.currency
$$;

create or replace function set_submission_status() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  due timestamptz;
begin
  new.submitted_at := now();
  select due_date into due from assignments where id = new.assignment_id;
  new.status := case when due is not null and new.submitted_at > due then 'late' else 'submitted' end;
  return new;
end;
$$;

create trigger trg_submission_status
before insert on submissions
for each row execute function set_submission_status();

create or replace function replace_own_submission(
  p_assignment_id uuid,
  p_drive_link text,
  p_file_name text default null
) returns submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_student_id uuid;
  v_current submissions%rowtype;
  v_created submissions%rowtype;
begin
  select *
  into v_assignment
  from assignments
  where id = p_assignment_id and status = 'active';

  if not found then
    raise exception 'assignment_not_found';
  end if;

  select id
  into v_student_id
  from profiles
  where auth_user_id = auth.uid() and status = 'active';

  if v_student_id is null then
    raise exception 'actor_not_active';
  end if;

  if not is_enrolled(v_assignment.class_id) then
    raise exception 'not_enrolled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_assignment_id::text || ':' || v_student_id::text, 0));

  select *
  into v_current
  from submissions
  where assignment_id = p_assignment_id
    and student_id = v_student_id
    and is_active = true
  for update;

  if found and v_current.score is not null then
    raise exception 'submission_already_graded';
  end if;

  update submissions
  set is_active = false
  where assignment_id = p_assignment_id
    and student_id = v_student_id
    and is_active = true;

  insert into submissions (
    assignment_id,
    student_id,
    drive_link,
    file_name,
    is_active
  ) values (
    p_assignment_id,
    v_student_id,
    p_drive_link,
    p_file_name,
    true
  )
  returning *
  into v_created;

  return v_created;
end;
$$;

create or replace function issue_receipt_doc(
  p_party_id uuid,
  p_party_name text,
  p_class_level text,
  p_issue_date date,
  p_currency text,
  p_note text,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_created_by uuid,
  p_prefix text,
  p_lines jsonb
) returns receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int;
  v_number text;
  v_counter int;
  v_receipt receipts%rowtype;
begin
  v_year := extract(year from p_issue_date);
  v_counter := next_document_number('receipt', v_year);
  v_number := p_prefix || '-' || v_year || '-' || lpad(v_counter::text, 4, '0');

  insert into receipts (
    number,
    student_id,
    student_name_snapshot,
    class_snapshot,
    issue_date,
    currency,
    note,
    subtotal,
    discount,
    total,
    voided,
    created_by
  ) values (
    v_number,
    p_party_id,
    p_party_name,
    p_class_level,
    p_issue_date,
    p_currency,
    p_note,
    p_subtotal,
    p_discount,
    p_total,
    false,
    p_created_by
  )
  returning *
  into v_receipt;

  insert into receipt_lines (receipt_id, subject, hours, rate, amount)
  select
    v_receipt.id,
    item->>'label',
    (item->>'hours')::numeric,
    (item->>'rate')::numeric,
    (item->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item;

  return v_receipt;
end;
$$;

create or replace function issue_payslip_doc(
  p_party_id uuid,
  p_party_name text,
  p_class_level text,
  p_issue_date date,
  p_currency text,
  p_note text,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_created_by uuid,
  p_prefix text,
  p_lines jsonb
) returns payslips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int;
  v_number text;
  v_counter int;
  v_payslip payslips%rowtype;
begin
  v_year := extract(year from p_issue_date);
  v_counter := next_document_number('payslip', v_year);
  v_number := p_prefix || '-' || v_year || '-' || lpad(v_counter::text, 4, '0');

  insert into payslips (
    number,
    tutor_id,
    tutor_name_snapshot,
    issue_date,
    currency,
    note,
    subtotal,
    discount,
    total,
    voided,
    created_by
  ) values (
    v_number,
    p_party_id,
    p_party_name,
    p_issue_date,
    p_currency,
    p_note,
    p_subtotal,
    p_discount,
    p_total,
    false,
    p_created_by
  )
  returning *
  into v_payslip;

  insert into payslip_lines (payslip_id, label, hours, rate, amount)
  select
    v_payslip.id,
    item->>'label',
    (item->>'hours')::numeric,
    (item->>'rate')::numeric,
    (item->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item;

  return v_payslip;
end;
$$;

revoke execute on function next_document_number(text, int) from public;
grant execute on function next_document_number(text, int) to service_role;

revoke execute on function replace_own_submission(uuid, text, text) from public;
grant execute on function replace_own_submission(uuid, text, text) to authenticated;

revoke execute on function issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) from public;
revoke execute on function issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) from public;
grant execute on function issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) to service_role;
grant execute on function issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) to service_role;

revoke execute on function finance_totals(text) from public;
grant execute on function finance_totals(text) to authenticated;
grant execute on function finance_totals(text) to service_role;

-- -----------------------------------------------------------------------------
-- RLS and column grants
-- -----------------------------------------------------------------------------

alter table profiles enable row level security;
alter table org_settings enable row level security;
alter table persona_assignments enable row level security;
alter table classes enable row level security;
alter table enrollments enable row level security;
alter table class_tutors enable row level security;
alter table mentorships enable row level security;
alter table audit_log enable row level security;
alter table announcements enable row level security;
alter table resources enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table meet_links enable row level security;
alter table comments enable row level security;
alter table timetable_slots enable row level security;
alter table calendar_events enable row level security;
alter table attendance enable row level security;
alter table receipts enable row level security;
alter table receipt_lines enable row level security;
alter table payslips enable row level security;
alter table payslip_lines enable row level security;
alter table document_counters enable row level security;
alter table reminders enable row level security;

create policy profiles_self_read on profiles for select
  using (auth_user_id = auth.uid() or is_active_admin());
create policy profiles_self_update on profiles for update
  using (auth_user_id = auth.uid() or is_active_admin());
create policy profiles_admin_write on profiles for all
  using (is_active_admin()) with check (is_active_admin());

revoke update on table profiles from authenticated;
grant update (full_name, class_level) on table profiles to authenticated;

create policy org_read on org_settings for select using (current_status() = 'active');
create policy org_admin_write on org_settings for all
  using (is_active_admin()) with check (is_active_admin());

create policy persona_assignments_self_read on persona_assignments for select
  using (profile_id = current_profile_id() or is_active_admin());
create policy persona_assignments_admin_insert on persona_assignments for insert
  with check (is_active_admin());
create policy persona_assignments_admin_update on persona_assignments for update
  using (is_active_admin()) with check (is_active_admin());
create policy persona_assignments_admin_delete on persona_assignments for delete
  using (is_active_admin());

create policy classes_read on classes for select using (
  is_active_admin() or teaches_class(id) or is_enrolled(id)
);
create policy classes_admin_write on classes for all
  using (is_active_admin()) with check (is_active_admin());

create policy enrollments_read on enrollments for select using (
  is_active_admin() or teaches_class(class_id) or is_self_active(student_id)
);
create policy enrollments_admin_write on enrollments for all
  using (is_active_admin()) with check (is_active_admin());

create policy class_tutors_read on class_tutors for select using (
  is_active_admin() or is_self_active(tutor_id)
);
create policy class_tutors_admin_write on class_tutors for all
  using (is_active_admin()) with check (is_active_admin());

create policy mentorships_read on mentorships for select using (
  is_active_admin() or is_self_active(tutor_id) or is_self_active(student_id)
);
create policy mentorships_admin_write on mentorships for all
  using (is_active_admin()) with check (is_active_admin());

create policy audit_read on audit_log for select using (is_active_admin());
create policy audit_admin_insert on audit_log for insert with check (is_active_admin());

create policy announcements_read on announcements for select using (
  is_active_admin()
  or (class_id is null and current_status() = 'active' and status = 'active')
  or (is_enrolled(class_id) and status = 'active')
  or teaches_class(class_id)
);
create policy announcements_insert on announcements for insert with check (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
);
create policy announcements_update on announcements for update using (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
) with check (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
);

create policy resources_read on resources for select using (
  is_active_admin()
  or (is_enrolled(class_id) and status = 'active')
  or teaches_class(class_id)
);
create policy resources_insert on resources for insert with check (
  is_active_admin() or teaches_class(class_id)
);
create policy resources_update on resources for update using (
  is_active_admin() or teaches_class(class_id)
) with check (
  is_active_admin() or teaches_class(class_id)
);

create policy assignments_read on assignments for select using (
  is_active_admin()
  or (is_enrolled(class_id) and status = 'active')
  or teaches_class(class_id)
);
create policy assignments_insert on assignments for insert with check (
  is_active_admin() or teaches_class(class_id)
);
create policy assignments_update on assignments for update using (
  is_active_admin() or teaches_class(class_id)
) with check (
  is_active_admin() or teaches_class(class_id)
);

create policy submissions_read on submissions for select using (
  is_active_admin()
  or exists (select 1 from assignments a where a.id = assignment_id and teaches_class(a.class_id))
  or is_self_active(student_id)
  or mentors_student(student_id)
);
create policy submissions_insert on submissions for insert with check (
  exists (
    select 1
    from assignments a
    where a.id = assignment_id
      and a.status = 'active'
      and is_enrolled(a.class_id)
  )
  and is_self_active(student_id)
);
create policy submissions_update on submissions for update using (
  is_active_admin() or is_self_active(student_id)
) with check (
  is_active_admin() or is_self_active(student_id)
);

revoke insert, update on table submissions from authenticated;
grant insert (assignment_id, student_id, drive_link, file_name, submitted_at, status, is_active)
  on table submissions to authenticated;
grant update (is_active) on table submissions to authenticated;

create policy meet_links_read on meet_links for select using (
  is_active_admin()
  or (class_id is null and current_status() = 'active')
  or teaches_class(class_id)
  or is_enrolled(class_id)
);
create policy meet_links_write on meet_links for all using (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
) with check (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
);

create policy comments_read on comments for select using (
  is_active_admin()
  or (
    entity_type = 'submission'
    and exists (
      select 1 from submissions s
      where s.id = entity_id
        and (
          is_self_active(s.student_id)
          or exists (select 1 from assignments a where a.id = s.assignment_id and teaches_class(a.class_id))
          or mentors_student(s.student_id)
        )
    )
  )
  or (
    entity_type = 'resource'
    and exists (
      select 1 from resources r
      where r.id = entity_id
        and (teaches_class(r.class_id) or (is_enrolled(r.class_id) and r.status = 'active'))
    )
  )
  or (
    entity_type = 'meet'
    and exists (
      select 1 from meet_links m
      where m.id = entity_id
        and (m.class_id is null or teaches_class(m.class_id) or is_enrolled(m.class_id))
    )
  )
);
create policy comments_insert on comments for insert with check (
  is_active_admin()
  or (
    is_self_active(author_id)
    and (
      (
        entity_type = 'submission'
        and exists (
          select 1 from submissions s
          where s.id = entity_id
            and (
              is_self_active(s.student_id)
              or exists (select 1 from assignments a where a.id = s.assignment_id and teaches_class(a.class_id))
              or mentors_student(s.student_id)
            )
        )
      )
      or (
        entity_type = 'resource'
        and exists (
          select 1 from resources r
          where r.id = entity_id
            and (teaches_class(r.class_id) or (is_enrolled(r.class_id) and r.status = 'active'))
        )
      )
      or (
        entity_type = 'meet'
        and exists (
          select 1 from meet_links m
          where m.id = entity_id
            and (m.class_id is null or teaches_class(m.class_id) or is_enrolled(m.class_id))
        )
      )
    )
  )
);

create policy timetable_slots_read on timetable_slots for select using (
  is_active_admin() or teaches_class(class_id) or is_enrolled(class_id)
);
create policy timetable_slots_write on timetable_slots for all using (
  is_active_admin() or teaches_class(class_id)
) with check (
  is_active_admin() or teaches_class(class_id)
);

create policy calendar_events_read on calendar_events for select using (
  is_active_admin()
  or (class_id is null and current_status() = 'active')
  or teaches_class(class_id)
  or is_enrolled(class_id)
);
create policy calendar_events_write on calendar_events for all using (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
) with check (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
);

create policy attendance_read on attendance for select using (
  is_active_admin()
  or teaches_class(class_id)
  or is_self_active(student_id)
  or mentors_student(student_id)
);
create policy attendance_write on attendance for all using (
  is_active_admin() or teaches_class(class_id)
) with check (
  (is_active_admin() or teaches_class(class_id))
  and exists (
    select 1
    from enrollments e
    where e.class_id = attendance.class_id
      and e.student_id = attendance.student_id
      and e.active
  )
);

create policy receipts_read on receipts for select using (
  is_active_admin() or is_self_active(student_id)
);
-- Finance mutations intentionally do NOT go through caller-JWT RLS writes.
-- Issuance/void flows use service-role server code, so the DB policy surface for
-- authenticated callers should remain read-only here.

create policy receipt_lines_read on receipt_lines for select using (
  is_active_admin()
  or exists (
    select 1
    from receipts r
    join profiles p on p.id = r.student_id
    where r.id = receipt_id
      and p.id = current_profile_id()
      and p.status = 'active'
  )
);

create policy payslips_read on payslips for select using (
  is_active_admin() or is_self_active(tutor_id)
);

create policy payslip_lines_read on payslip_lines for select using (
  is_active_admin()
  or exists (
    select 1
    from payslips ps
    join profiles p on p.id = ps.tutor_id
    where ps.id = payslip_id
      and p.id = current_profile_id()
      and p.status = 'active'
  )
);

create policy reminders_all on reminders for all using (
  is_self_active(user_id)
);

-- -----------------------------------------------------------------------------
-- Bootstrap sync of persona data for any existing rows inserted before triggers
-- -----------------------------------------------------------------------------

insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
select
  p.id,
  case
    when p.role = 'admin' then 'admin'::persona_name
    when p.role = 'sub_admin' then 'sub_admin'::persona_name
    when p.role = 'tutor' then 'tutor'::persona_name
    else 'student'::persona_name
  end,
  'global'::persona_scope_type,
  null,
  case when p.status = 'active' then 'active' else 'inactive' end
from profiles p
on conflict (profile_id, persona_name, scope_type, scope_key)
do update set status = excluded.status;

insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
select
  m.tutor_id,
  'mentor'::persona_name,
  'student'::persona_scope_type,
  m.student_id,
  case when m.active then 'active' else 'inactive' end
from mentorships m
on conflict (profile_id, persona_name, scope_type, scope_key)
do update set status = excluded.status;

-- -----------------------------------------------------------------------------
-- Messaging domain (mirrors migration 0018) -- direct + group conversations,
-- separate from comments. RLS is the trust boundary; recipient eligibility to
-- START a conversation is an app-layer persona policy.
-- -----------------------------------------------------------------------------

create type conversation_kind as enum ('direct', 'group');

create or replace function current_profile_id() returns uuid
language sql security definer stable set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid()
$$;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  kind conversation_kind not null,
  title text,
  created_by uuid references profiles(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (conversation_id, profile_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_conversation_participants_profile on conversation_participants(profile_id);
create index idx_conversation_participants_conversation on conversation_participants(conversation_id);
create index idx_messages_conversation_created on messages(conversation_id, created_at);
create index idx_conversations_last_message on conversations(last_message_at desc);

create or replace function is_conversation_member(p_conversation_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.profile_id = current_profile_id()
  )
$$;

alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;

create policy conversations_read on conversations for select
  using (is_conversation_member(id) or is_active_admin());
create policy conversations_insert on conversations for insert
  with check (created_by = current_profile_id());
create policy conversation_participants_read on conversation_participants for select
  using (is_conversation_member(conversation_id) or is_active_admin());
create policy messages_read on messages for select
  using (is_conversation_member(conversation_id) or is_active_admin());
create policy messages_insert on messages for insert
  with check (sender_id = current_profile_id() and is_conversation_member(conversation_id));

-- -----------------------------------------------------------------------------
-- Verification notes
-- -----------------------------------------------------------------------------

-- Recommended post-run checks:
-- 1. select * from persona_assignments order by profile_id, persona_name;
-- 2. verify one global persona row exists for every profile
-- 3. verify mentor persona rows mirror mentorships
-- 4. verify all RLS tables exist and row level security is enabled
-- 5. verify replace_own_submission and issue_*_doc functions compile and execute
