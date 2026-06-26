-- Phase 6 — direct teacher↔student mentorship links (access scoping beyond
-- course enrollment). A teacher only has access to the students assigned to
-- them; the link is editable by admin at any time. Depends on 0001 (profiles).

create table mentorships (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, student_id)
);
create index mentorships_teacher_idx on mentorships (teacher_id);
create index mentorships_student_idx on mentorships (student_id);

alter table mentorships enable row level security;

-- Read: admin sees all; a teacher sees their own links; a student sees theirs.
create policy mentorships_read on mentorships for select using (
  is_active_admin()
  or exists (select 1 from profiles p where p.id = teacher_id and p.auth_user_id = auth.uid())
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
);
-- Write: admin only (relationships are managed centrally).
create policy mentorships_admin_write on mentorships for all
  using (is_active_admin()) with check (is_active_admin());

-- Helper mirrors is_enrolled/teaches_course: does the current teacher mentor this student?
create or replace function mentors_student(p_student_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from mentorships m
    join profiles p on p.id = m.teacher_id
    where p.auth_user_id = auth.uid() and m.student_id = p_student_id
  )
$$;
