-- 0037_mentors_student_require_persona.sql
--
-- Align RLS mentee-data authorization with the app invariant that the scoped
-- `mentor` persona is the SINGLE source of truth for mentor access.
--
-- Problem: mentors_student() (0021) authorized purely off an active `mentorships`
-- row + active mentor profile, and never consulted persona_assignments. That
-- contradicts the app layer (canMentor keys off the scoped persona) and leaves a
-- data-exposure gap: a "ghost" mentorship - an active link with NO active scoped
-- persona - still grants the mentor RLS read access to that student's submissions,
-- attendance and comments. A ghost is reachable when assignMentor's persona-create
-- AND its compensating link-rollback both fail, or when removeMentor deletes the
-- persona but fails to deactivate the link.
--
-- Fix: require an ACTIVE student-scoped `mentor` persona for the pair too, so the
-- RLS grant and the app grant agree and both fail closed if either is absent.
--
-- Safety: this only tightens access, so we FIRST backfill an active scoped mentor
-- persona for every active mentorship. That guarantees no legitimate mentor (incl.
-- seed/legacy rows written before the persona system, or a prior partial assign)
-- loses access when the function is tightened below. Idempotent.

begin;

-- 1. Backfill: every active mentorship gets its active student-scoped mentor persona.
insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
select m.mentor_id, 'mentor'::persona_name, 'student'::persona_scope_type, m.student_id, 'active'
from mentorships m
where m.active
on conflict (profile_id, persona_name, scope_id) do update set status = 'active';

-- 2. Tighten mentors_student to require that active scoped persona.
create or replace function mentors_student(p_student_id uuid) returns boolean
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
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and m.student_id = p_student_id
      and m.active
  )
$$;

commit;
