-- 0064: subjects master list, the subject a class teaches, and richer person details.
-- Depends on 0001 (profiles, current_status), 0002 (classes).
--
-- MODEL NOTE: a `class` is already the 1:1 teaching unit - one student + one tutor
-- (a student has one class per subject/tutor; see enrollments.ts). This migration
-- adds (a) a managed `subjects` list, (b) the SUBJECT a class teaches, and (c) the
-- extra person fields captured when an admin/sub-admin adds a student or tutor. No
-- separate class<->subject join is needed: the class IS the (student, subject, tutor)
-- unit, so the subject is a single column on it.

-- 1. Subjects master list. Written via the service role after an app capability check
--    (mirrors classes/tags); read by any active user for the assignment pickers.
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Case-insensitive uniqueness so "Maths" and "maths" can't both exist - the inline
-- "+ Add" on the picker reuses an existing name instead of forking a duplicate.
create unique index if not exists subjects_name_lower_key on subjects (lower(name));

alter table subjects enable row level security;
drop policy if exists subjects_read on subjects;
create policy subjects_read on subjects for select using (current_status() = 'active');
-- No write policy: denied to anon/authenticated; the app writes via the service role
-- after a manageClasses/manageUsers capability check.

-- 2. The subject a class teaches. Nullable - legacy classes predate subjects and keep
--    their meaning (subject unknown / carried on their timetable slots).
alter table classes add column if not exists subject_id uuid references subjects(id) on delete set null;
create index if not exists classes_subject_idx on classes (subject_id);
comment on column classes.subject_id is
  'The subject this 1:1 class teaches (the class already fixes the student + tutor). NULL for legacy classes.';

-- 3. Richer person details. Captured by admin/sub-admin at add-user time (identity +
--    contact) or self-completed by the person at first sign-in (the softer fields).
--    All nullable; role decides which are shown/required in the UI, not the DB.
alter table profiles
  add column if not exists country text,
  add column if not exists phone text,
  add column if not exists guardian_name text,
  add column if not exists guardian_phone text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists address text,
  add column if not exists joined_on date,
  add column if not exists qualifications text,
  add column if not exists bio text;

-- 4. Seed a starter subject list (idempotent via the case-insensitive unique index).
insert into subjects (name) values
  ('Mathematics'), ('Physics'), ('Chemistry'), ('Biology'), ('English'),
  ('Computer Science'), ('Accountancy'), ('Economics'), ('Business Studies'), ('Hindi')
on conflict do nothing;
