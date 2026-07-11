-- Classes + people: membership (enrollments, class_teachers), mentorships, and
-- the audit log. Depends on 0001 (profiles, is_active_admin, current_status).
--
-- Membership rows are soft-deletable (`active`): "remove" flips it false and
-- re-adding flips it true, so history is kept and access is reversible. The
-- scope helpers ignore inactive links so access is revoked immediately.

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',          -- 'active' | 'archived'
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
create index enrollments_class_idx on enrollments (class_id, active);
create index enrollments_student_idx on enrollments (student_id, active);

create table class_teachers (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (teacher_id, class_id)
);
create index class_teachers_class_idx on class_teachers (class_id, active);
create index class_teachers_teacher_idx on class_teachers (teacher_id, active);

-- Direct teacher↔student mentorship (pastoral scope beyond class enrolment): a
-- mentor only has access to their assigned students. Admin-managed.
create table mentorships (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (teacher_id, student_id)
);
create index mentorships_teacher_idx on mentorships (teacher_id, active);
create index mentorships_student_idx on mentorships (student_id, active);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  created_at timestamptz not null default now()
);

-- ---- scope helpers (SECURITY DEFINER; match auth.uid() to profiles.auth_user_id) ----
-- Require the caller to be ACTIVE and the membership link active, so a disabled
-- account or a soft-removed link is denied at the DB layer immediately.
create or replace function is_enrolled(p_class_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from enrollments e
    join profiles p on p.id = e.student_id
    where p.auth_user_id = auth.uid() and p.status = 'active'
      and e.class_id = p_class_id and e.active
  )
$$;

create or replace function teaches_class(p_class_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from class_teachers ct
    join profiles p on p.id = ct.teacher_id
    where p.auth_user_id = auth.uid() and p.status = 'active'
      and ct.class_id = p_class_id and ct.active
  )
$$;

create or replace function mentors_student(p_student_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from mentorships m
    join profiles p on p.id = m.teacher_id
    where p.auth_user_id = auth.uid() and p.status = 'active'
      and m.student_id = p_student_id and m.active
  )
$$;

alter table classes enable row level security;
alter table enrollments enable row level security;
alter table class_teachers enable row level security;
alter table mentorships enable row level security;
alter table audit_log enable row level security;

-- classes: any active user reads; admin writes
create policy classes_read on classes for select
  using (current_status() = 'active');
create policy classes_admin_write on classes for all
  using (is_active_admin()) with check (is_active_admin());

-- enrollments: admin, the student themselves, or a teacher of the class can read; admin writes
create policy enrollments_read on enrollments for select using (
  is_active_admin()
  or teaches_class(class_id)
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
);
create policy enrollments_admin_write on enrollments for all
  using (is_active_admin()) with check (is_active_admin());

-- class_teachers: admin or the teacher themselves can read; admin writes
create policy class_teachers_read on class_teachers for select using (
  is_active_admin()
  or exists (select 1 from profiles p where p.id = teacher_id and p.auth_user_id = auth.uid())
);
create policy class_teachers_admin_write on class_teachers for all
  using (is_active_admin()) with check (is_active_admin());

-- mentorships: admin sees all; teacher/student see their own links; admin writes
create policy mentorships_read on mentorships for select using (
  is_active_admin()
  or exists (select 1 from profiles p where p.id = teacher_id and p.auth_user_id = auth.uid())
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
);
create policy mentorships_admin_write on mentorships for all
  using (is_active_admin()) with check (is_active_admin());

-- audit_log: admins read; inserts via service-role (RLS bypassed) or admin
create policy audit_read on audit_log for select using (is_active_admin());
create policy audit_admin_insert on audit_log for insert with check (is_active_admin());
