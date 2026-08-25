-- 0078_mentee_notes.sql
-- A mentor's private pastoral notes about a mentee (the student).
--
-- WHY: the session staff_note is the TUTOR's note on a teaching session (manageClassContent).
-- A mentor's job is pastoral observation, so they need their own note channel attached to
-- the STUDENT, not the tutor's session. Readable by the student's mentor(s) and admins;
-- NEVER by the student, and not by tutors (unless they also mentor the student). Writes go
-- through the service role (the app gates on canMentor), so there is no insert/update/delete
-- policy - the Data API can't forge or alter a note - and reads use the RLS policy below.

begin;

create table if not exists mentee_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists mentee_notes_student_idx on mentee_notes (student_id, created_at desc);

alter table mentee_notes enable row level security;

-- Read: an admin, or a mentor of this student. Not the student; not a plain tutor.
drop policy if exists mentee_notes_read on mentee_notes;
create policy mentee_notes_read on mentee_notes for select using (
  is_active_admin() or mentors_student(student_id)
);
-- No insert/update/delete policy on purpose: notes are written service-role only and are
-- immutable once written (an append-only pastoral log).

commit;
