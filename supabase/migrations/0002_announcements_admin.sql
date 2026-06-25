-- Phase 1 — Admin (courses/enrollments/teacher-assignments) + Announcements + audit log.
-- Depends on 0001_foundation.sql (profiles, current_app_role, current_status, is_active_admin).

create table courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',          -- 'active' | 'archived'
  created_at timestamptz not null default now()
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);

create table course_teachers (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, course_id)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,  -- null = global
  title text not null,
  message text not null,
  author_id uuid references profiles(id) on delete set null,
  status text not null default 'active',          -- 'active' | 'archived'
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  created_at timestamptz not null default now()
);

-- ---- scope helpers (SECURITY DEFINER; match auth.uid() to profiles.auth_user_id) ----
create or replace function is_enrolled(p_course_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from enrollments e
    join profiles p on p.id = e.student_id
    where p.auth_user_id = auth.uid() and e.course_id = p_course_id
  )
$$;

create or replace function teaches_course(p_course_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from course_teachers ct
    join profiles p on p.id = ct.teacher_id
    where p.auth_user_id = auth.uid() and ct.course_id = p_course_id
  )
$$;

alter table courses enable row level security;
alter table enrollments enable row level security;
alter table course_teachers enable row level security;
alter table announcements enable row level security;
alter table audit_log enable row level security;

-- courses: any active user reads; admin writes
create policy courses_read on courses for select
  using (current_status() = 'active');
create policy courses_admin_write on courses for all
  using (is_active_admin()) with check (is_active_admin());

-- enrollments: admin, the student themselves, or a teacher of the course can read; admin writes
create policy enrollments_read on enrollments for select using (
  is_active_admin()
  or teaches_course(course_id)
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
);
create policy enrollments_admin_write on enrollments for all
  using (is_active_admin()) with check (is_active_admin());

-- course_teachers: admin or the teacher themselves can read; admin writes
create policy course_teachers_read on course_teachers for select using (
  is_active_admin()
  or exists (select 1 from profiles p where p.id = teacher_id and p.auth_user_id = auth.uid())
);
create policy course_teachers_admin_write on course_teachers for all
  using (is_active_admin()) with check (is_active_admin());

-- announcements: admin sees all; students see active global + active enrolled; teachers see their courses
create policy announcements_read on announcements for select using (
  is_active_admin()
  or (course_id is null and current_status() = 'active' and status = 'active')
  or (is_enrolled(course_id) and status = 'active')
  or teaches_course(course_id)
);
create policy announcements_insert on announcements for insert with check (
  is_active_admin() or (course_id is not null and teaches_course(course_id))
);
create policy announcements_update on announcements for update using (
  is_active_admin() or (course_id is not null and teaches_course(course_id))
) with check (
  is_active_admin() or (course_id is not null and teaches_course(course_id))
);

-- audit_log: admins read; inserts via service-role (RLS bypassed) or admin
create policy audit_read on audit_log for select using (is_active_admin());
create policy audit_admin_insert on audit_log for insert with check (is_active_admin());
