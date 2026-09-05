-- 0092_sub_admin_class_authority.sql
-- Give the sub_admin persona the class authority its capability baseline and
-- docs/persona-model.md have always described.
--
-- THE GAP: sub_admin holds manageClasses / manageClassContent / manageCalendar /
-- viewGrading / viewClasses, but every enforcement layer keyed on the ADMIN persona, so a
-- sub_admin 404'd on every class workspace and could write nothing. The capability grant,
-- the nav, and the docs all promised access the system refused to deliver.
--
-- SCOPE - deliberately narrow. This widens ONLY the two class-scope functions:
--   * teaches_class_write() - the tutor-only CONTENT write scope (announcements,
--     assignments, resources, meet links, calendar/timetable deletes)
--   * teaches_class()       - the broader class scope (reads, attendance, calendar and
--                             timetable writes, class_sessions, enrollments, reminders)
-- It does NOT touch is_active_admin(). Widening that would hand sub_admins the finance
-- ledger, the audit history, capability overrides and persona assignment - the powers
-- persona-model.md explicitly reserves for the admin tier. Those stay admin-only and remain
-- grantable per user through an audited capability override.
--
-- Net effect: a sub_admin gains academy-wide authority over class-scoped tables only,
-- matching the app guards updated in the same change (canAccessClass / canWriteClass /
-- canWriteCalendar / documentRoleFor). App and RLS stay in step, so a permitted write is
-- never refused by the database as a raw 500.
--
-- Depends on 0022 (user_has_persona), 0079 (teaches_class_write), 0082 (teaches_class).

-- The sub_admin mirror of is_active_admin(): the CURRENT caller holds an active, global
-- sub_admin persona on an active profile.
create or replace function public.is_active_sub_admin() returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
  select public.user_has_persona(
    (select id from profiles where auth_user_id = auth.uid()),
    'sub_admin'::persona_name
  )
$$;

comment on function public.is_active_sub_admin() is
  'True when the current caller holds an active global sub_admin persona. Class-scope only - admin-tier powers still gate on is_active_admin().';

-- Content write scope: tutor of the class, or a sub_admin (academy-wide).
create or replace function public.teaches_class_write(p_class_id uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
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
  or public.is_active_sub_admin()
$$;

-- Broader class scope: tutor of the class, mentor of an enrolled student, or a sub_admin.
create or replace function public.teaches_class(p_class_id uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
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
  or public.mentors_class(p_class_id)
  or public.is_active_sub_admin()
$$;

revoke all on function public.is_active_sub_admin() from public;
grant execute on function public.is_active_sub_admin() to authenticated;
