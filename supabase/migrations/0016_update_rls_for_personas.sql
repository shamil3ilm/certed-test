-- Migration 0016: Persona helper functions for RLS
-- Purpose: Provide SQL helpers that check persona assignments, so RLS policies
--          can authorize against persona_assignments (added in 0014) rather than
--          the legacy profiles.role column.
-- Depends on: 0014 (persona_assignments, persona_name, persona_scope_type)

-- Check whether a profile holds a given persona at a given scope.
create or replace function user_has_persona(
  p_user_id uuid,
  p_persona persona_name,
  p_scope_type persona_scope_type default 'global'::persona_scope_type,
  p_scope_id uuid default null
) returns boolean as $$
begin
  return exists (
    select 1
    from persona_assignments pa
    where pa.profile_id = p_user_id
      and pa.persona_name = p_persona
      and pa.scope_type = p_scope_type
      and (
        (p_scope_type = 'global' and pa.scope_id is null) or
        (p_scope_type != 'global' and pa.scope_id = p_scope_id)
      )
      and pa.status = 'active'
  );
end;
$$ language plpgsql security definer;

-- Convenience: is this profile a global admin?
create or replace function user_is_admin(p_user_id uuid) returns boolean as $$
begin
  return user_has_persona(p_user_id, 'admin'::persona_name);
end;
$$ language plpgsql security definer;

-- Convenience: is this profile a mentor for a specific student?
create or replace function user_is_mentor_for_student(
  p_user_id uuid,
  p_student_id uuid
) returns boolean as $$
begin
  return user_has_persona(
    p_user_id,
    'mentor'::persona_name,
    'student'::persona_scope_type,
    p_student_id
  );
end;
$$ language plpgsql security definer;
