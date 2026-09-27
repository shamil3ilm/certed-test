-- 0120: a student has a mentor from the day they are invited, and keeps one.
--
-- Two halves of the same rule, because the app now creates a student WITH their mentor
-- (validateAddUserInput refuses one without): the pastoral view is how a student is seen at all,
-- and a student in nobody's mentee list is watched by nobody.
--
-- 1. assign_mentorship refused any student who was not ACTIVE, but an invited account is PENDING
--    until the person registers (0112 creates it that way). Creating a student with a mentor
--    therefore could not succeed: the assign was refused and the whole add rolled back. It now
--    accepts a student who has not been revoked - pending or active - which is the same line
--    enrolment draws (0115 refuses "revoked or not a student"). A revoked or erased account
--    still gets no mentor, and no mentor gets reach over one.
--
-- 2. remove_mentorship was unguarded, so the rule held only at creation: the last link could be
--    taken and the student left outside every mentor's list. It now refuses the LAST ACTIVE link
--    of a student who is pending or active.
--
-- The refusal is narrow on purpose: a student with several mentors still loses any of them, an
-- already-inactive link is removed again (an idempotent retry is unaffected), and a revoked or
-- erased account is cleaned up freely.
--
-- Swapping assigns the replacement FIRST and removes the old link second (replaceMentor), so a
-- swap never dips to zero and never meets the refusal.
--
-- Refusal codes: student_not_active (unchanged name, wider rule) and last_mentor, which the data
-- layer turns into messages naming what to do.

begin;

-- ── a mentor may be assigned from the invitation onwards ────────────────────

create or replace function assign_mentorship(p_mentor_id uuid, p_student_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Same key as remove_mentorship, so an assign and a remove of one pair take turns.
  perform pg_advisory_xact_lock(hashtextextended('mentorship:' || p_mentor_id::text || ':' || p_student_id::text, 0));

  perform 1 from profiles where id = p_mentor_id and role in ('mentor', 'tutor') and status = 'active' for share;
  if not found then
    raise exception 'mentor_not_assignable';
  end if;
  -- Pending (invited, not yet registered) or active - never revoked.
  perform 1 from profiles where id = p_student_id and role = 'student' and status <> 'disabled' for share;
  if not found then
    raise exception 'student_not_active';
  end if;

  insert into mentorships (mentor_id, student_id, active)
  values (p_mentor_id, p_student_id, true)
  on conflict (mentor_id, student_id) do update set active = true
  returning id into v_id;

  -- The persona is what grants access; the link alone grants nothing.
  insert into persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
  values (p_mentor_id, 'mentor', 'student', p_student_id, 'active')
  on conflict (profile_id, persona_name, scope_id) do update set status = 'active', scope_type = 'student';

  return v_id;
end;
$$;

-- ── ...and the last one cannot be taken away ────────────────────────────────

create or replace function remove_mentorship(p_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentor uuid;
  v_student uuid;
  v_active boolean;
  v_student_status text;
begin
  -- Read the pair WITHOUT a row lock, take the pair lock, then write. Locking the row first
  -- would invert assign_mentorship's order (pair lock, then the row) and could deadlock.
  select mentor_id, student_id, active into v_mentor, v_student, v_active from mentorships where id = p_id;
  if not found then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mentorship:' || v_mentor::text || ':' || v_student::text, 0));

  if v_active then
    select status into v_student_status from profiles where id = v_student;
    if v_student_status <> 'disabled' then
      -- Two removals racing to be the last one would each see the other's link as still active
      -- and both commit, so the check row-locks the student's other live links: the second
      -- removal re-reads after the first commits, and is refused.
      perform 1 from mentorships
        where student_id = v_student and active and id <> p_id
        for update;
      if not found then
        raise exception 'last_mentor';
      end if;
    end if;
  end if;

  delete from persona_assignments
   where profile_id = v_mentor and persona_name = 'mentor' and scope_type = 'student' and scope_id = v_student;
  update mentorships set active = false where id = p_id;
  return true;
end;
$$;

commit;
