-- Phase-1 features: topics, grading, attendance. Depends on 0002 (classes, scope
-- helpers) and 0003 (assignments, submissions, resources).

-- ── Topics + grading ─────────────────────────────────────────────────────────
alter table assignments add column if not exists topic text;
alter table assignments add column if not exists max_marks numeric(6,2);
alter table resources   add column if not exists topic text;

alter table submissions add column if not exists score numeric(6,2);
alter table submissions add column if not exists feedback text;
alter table submissions add column if not exists graded_at timestamptz;
alter table submissions add column if not exists graded_by uuid references profiles(id) on delete set null;
-- Grading is written by the teacher via the service-role server action (gated by
-- canManageClass); the student reads their own score under the existing
-- submissions_read policy, so no RLS change is needed here.

-- ── Attendance ───────────────────────────────────────────────────────────────
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  session_date date not null,
  status text not null check (status in ('present','absent','late')),
  marked_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, student_id, session_date)
);
create index if not exists attendance_class_date_idx on attendance (class_id, session_date);
create index if not exists attendance_student_idx on attendance (student_id, session_date desc);

alter table attendance enable row level security;

-- read: admin, a teacher of the class, the student themselves, or the student's mentor
create policy attendance_read on attendance for select using (
  is_active_admin()
  or teaches_class(class_id)
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
  or mentors_student(student_id)
);
-- write: admin or a teacher of the class
create policy attendance_write on attendance for all
  using (is_active_admin() or teaches_class(class_id))
  with check (is_active_admin() or teaches_class(class_id));
