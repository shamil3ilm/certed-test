-- 0043_mentor_class_authority.sql
--
-- Give a MENTOR tutor-level authority over the classes their mentees are
-- enrolled in, at the row-level-security layer - matching the app-layer guards
-- (canManageClass / canAccessClass / canWriteClass), which already grant a
-- mentor this scoped access.
--
-- Every class-scoped policy in the schema (content, calendar, grading,
-- attendance) gates on teaches_class(class_id). Rather than recreate dozens of
-- policies, we widen the scope function once: teaches_class now returns true for
-- a tutor of the class OR a mentor of an actively-enrolled student in it. The
-- mentor branch carries the SAME anti-ghost rigor as mentors_student (0037) and
-- is_enrolled (0038): it requires an active, student-scoped mentor persona that
-- matches the mentorship, an active mentorship, and an active enrollment - so a
-- stale row alone can never confer access.

begin;

-- Mentor -> class authority helper. True when the current auth user actively
-- mentors a student who is actively enrolled in p_class_id.
create or replace function mentors_class(p_class_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1
    from mentorships m
    join profiles p on p.id = m.mentor_id
    join persona_assignments pa
      on pa.profile_id = m.mentor_id
     and pa.persona_name = 'mentor'::persona_name
     and pa.scope_type = 'student'::persona_scope_type
     and pa.scope_id = m.student_id
     and pa.status = 'active'
    join enrollments e
      on e.student_id = m.student_id
     and e.class_id = p_class_id
     and e.active
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and m.active
  )
$$;

-- Widen teaches_class: tutor of the class OR mentor of an enrolled student. The
-- tutor branch is unchanged from 0038 (active global tutor persona + active
-- class_tutors row); the mentor branch delegates to mentors_class above.
create or replace function teaches_class(p_class_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1
    from class_tutors ct
    join profiles p on p.id = ct.tutor_id
    join persona_assignments pa
      on pa.profile_id = ct.tutor_id
     and pa.persona_name = 'tutor'::persona_name
     and pa.scope_type = 'global'::persona_scope_type
     and pa.status = 'active'
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and ct.class_id = p_class_id
      and ct.active
  )
  or mentors_class(p_class_id)
$$;

-- RLS helper functions must stay callable by the policies that invoke them.
-- (0034 revoked EXECUTE from PUBLIC and set default privileges, so grant the
-- new function to authenticated explicitly.)
grant execute on function mentors_class(uuid) to authenticated;
grant execute on function teaches_class(uuid) to authenticated;

commit;
