-- Phase 3 — Assignments + submissions.
-- Depends on 0001 (helpers) and 0002 (courses, is_enrolled, teaches_course).

create table assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz not null,                 -- absolute instant (UTC)
  attachment_drive_file_id text,                 -- optional; upload UI deferred
  attachment_drive_link text,
  created_by uuid references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  drive_file_id text not null,
  drive_link text,
  status text not null check (status in ('submitted', 'late')),  -- vs absolute due_date
  submitted_at timestamptz not null default now(),
  is_active boolean not null default true,       -- latest wins; prior kept as history
  created_at timestamptz not null default now()
);
-- At most one active submission per student per assignment.
create unique index submissions_one_active on submissions (assignment_id, student_id) where is_active;

alter table assignments enable row level security;
alter table submissions enable row level security;

-- assignments: students read active/enrolled; teachers manage their courses; admin all
create policy assignments_read on assignments for select using (
  is_active_admin()
  or (is_enrolled(course_id) and status = 'active')
  or teaches_course(course_id)
);
create policy assignments_insert on assignments for insert with check (
  is_active_admin() or teaches_course(course_id)
);
create policy assignments_update on assignments for update using (
  is_active_admin() or teaches_course(course_id)
) with check (
  is_active_admin() or teaches_course(course_id)
);

-- submissions: students read/write their own; teachers read submissions for their
-- courses' assignments; admin all.
create policy submissions_read on submissions for select using (
  is_active_admin()
  or exists (select 1 from assignments a where a.id = assignment_id and teaches_course(a.course_id))
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
);
create policy submissions_insert on submissions for insert with check (
  exists (
    select 1 from assignments a
    where a.id = assignment_id and a.status = 'active' and is_enrolled(a.course_id)
  )
  and exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
);
create policy submissions_update on submissions for update using (
  is_active_admin()
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
) with check (
  is_active_admin()
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
);
