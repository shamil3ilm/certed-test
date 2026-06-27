-- Migration 0008: Comments and Reminders

-- 1. Create submission_comments table
create table submission_comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table submission_comments enable row level security;

-- RLS for submission_comments
create policy comments_read on submission_comments for select using (
  is_active_admin()
  or exists (
    select 1 from submissions s
    where s.id = submission_id
    and (
      s.student_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
      or exists (select 1 from assignments a where a.id = s.assignment_id and teaches_course(a.course_id))
      or mentors_student(s.student_id)
    )
  )
);

create policy comments_insert on submission_comments for insert with check (
  is_active_admin()
  or (
    author_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
    and exists (
      select 1 from submissions s
      where s.id = submission_id
      and (
        s.student_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
        or exists (select 1 from assignments a where a.id = s.assignment_id and teaches_course(a.course_id))
        or mentors_student(s.student_id)
      )
    )
  )
);

-- 2. Create reminders table
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  remind_at timestamptz not null,
  is_sent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table reminders enable row level security;

create policy reminders_all on reminders for all using (
  exists (select 1 from profiles p where p.id = user_id and p.auth_user_id = auth.uid())
);

-- 3. Modify submissions RLS read policy to support mentorship scope
drop policy if exists submissions_read on submissions;
create policy submissions_read on submissions for select using (
  is_active_admin()
  or exists (select 1 from assignments a where a.id = assignment_id and teaches_course(a.course_id))
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
  or mentors_student(student_id)
);
