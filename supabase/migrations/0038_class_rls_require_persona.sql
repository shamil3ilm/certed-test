-- 0038_class_rls_require_persona.sql
--
-- Same alignment as 0037 (mentors_student), for the class side.
--
-- Problem: teaches_class() and is_enrolled() authorize purely off an active
-- membership row (class_tutors / enrollments) + active profile, and never consult
-- persona_assignments - while the app requires the GLOBAL tutor/student persona
-- (canManageClass/canAccessClass check loadPersonaFlags().isTutor/isStudent in
-- ADDITION to the membership). So a "ghost" membership - an active class_tutors
-- (or enrollment) row with no active global persona - grants RLS access the app
-- denies. For teaches_class this crosses a real trust boundary: it gates reads AND
-- writes to a whole class's assignments/attendance/resources/announcements/etc via
-- the Data API. The ghost is reachable for teaches_class when addTutor's tutor-
-- persona grant AND its compensating class_tutor rollback both fail (a dedicated
-- mentor added as a class tutor). is_enrolled has the same shape; not currently
-- reachable (student role is fixed and revoke disables profile status), but hardened
-- here for symmetry and defense-in-depth.
--
-- Fix: require the ACTIVE global persona in each function. Safety: only tightens,
-- so FIRST backfill the global persona for every active membership over an active
-- profile, guaranteeing no legitimate tutor/student loses access. Idempotent.

begin;

-- 1a. Backfill: reactivate an inactive global tutor persona for anyone who still teaches.
update persona_assignments pa
set status = 'active'
from class_tutors ct
join profiles p on p.id = ct.tutor_id
where ct.active and p.status = 'active'
  and ct.tutor_id = pa.profile_id
  and pa.persona_name = 'tutor'::persona_name
  and pa.scope_type = 'global'::persona_scope_type
  and pa.status <> 'active';

-- 1b. Backfill: create the global tutor persona for active tutors who have none.
insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
select distinct ct.tutor_id, 'tutor'::persona_name, 'global'::persona_scope_type, null, 'active'
from class_tutors ct
join profiles p on p.id = ct.tutor_id
where ct.active and p.status = 'active'
  and not exists (
    select 1 from persona_assignments pa
    where pa.profile_id = ct.tutor_id
      and pa.persona_name = 'tutor'::persona_name
      and pa.scope_type = 'global'::persona_scope_type
  );

-- 2a. Backfill: reactivate an inactive global student persona for anyone still enrolled.
update persona_assignments pa
set status = 'active'
from enrollments e
join profiles p on p.id = e.student_id
where e.active and p.status = 'active'
  and e.student_id = pa.profile_id
  and pa.persona_name = 'student'::persona_name
  and pa.scope_type = 'global'::persona_scope_type
  and pa.status <> 'active';

-- 2b. Backfill: create the global student persona for active enrolled students who have none.
insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
select distinct e.student_id, 'student'::persona_name, 'global'::persona_scope_type, null, 'active'
from enrollments e
join profiles p on p.id = e.student_id
where e.active and p.status = 'active'
  and not exists (
    select 1 from persona_assignments pa
    where pa.profile_id = e.student_id
      and pa.persona_name = 'student'::persona_name
      and pa.scope_type = 'global'::persona_scope_type
  );

-- 3. Tighten teaches_class to require the active global tutor persona.
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
$$;

-- 4. Tighten is_enrolled to require the active global student persona.
create or replace function is_enrolled(p_class_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1
    from enrollments e
    join profiles p on p.id = e.student_id
    join persona_assignments pa
      on pa.profile_id = e.student_id
     and pa.persona_name = 'student'::persona_name
     and pa.scope_type = 'global'::persona_scope_type
     and pa.status = 'active'
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and e.class_id = p_class_id
      and e.active
  )
$$;

commit;
