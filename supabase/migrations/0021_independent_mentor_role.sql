-- Mentor becomes an INDEPENDENT account identity: a mentor may or may not also be
-- a tutor. Previously a mentor was always a tutor (the mentorships "mentor side"
-- was named tutor_id and assignment required role = 'tutor'). This makes `mentor`
-- a first-class role, and renames the mentorship column to reflect that the
-- supervising party need not teach.
--
-- Mentee-access RLS is relationship-based (mentors_student joins the mentorships
-- row, never the mentor's role), so a non-tutor mentor gains mentee access purely
-- by being in mentorships — no access-policy change is needed here.

-- 1. Mentor as a fixed identity. ADD VALUE auto-commits and cannot be used in the
--    same transaction; it is a no-op if the value already exists.
alter type user_role add value if not exists 'mentor';

-- 2. The mentorship "mentor side" is a mentor (not necessarily a tutor): rename the
--    column + its index, and recreate the scope function whose stored source names
--    it (a column rename does not rewrite function bodies). The mentorships_read
--    policy and the unique(mentor_id, student_id) constraint follow the rename
--    automatically (their expressions reference the column, not its name).
alter table mentorships rename column tutor_id to mentor_id;
alter index mentorships_tutor_idx rename to mentorships_mentor_idx;

create or replace function mentors_student(p_student_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from mentorships m
    join profiles p on p.id = m.mentor_id
    where p.auth_user_id = auth.uid() and p.status = 'active'
      and m.student_id = p_student_id and m.active
  )
$$;
