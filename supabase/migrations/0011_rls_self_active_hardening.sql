-- 0011: RLS hardening — a revoked ('disabled') user's own JWT/session is not
-- invalidated on revoke (Supabase Auth tokens keep refreshing until they
-- expire), so RLS is the only real backstop per the trust model documented in
-- 0009. Several "is this my own row?" self-branches check only
-- `auth_user_id = auth.uid()` without also requiring `status = 'active'`,
-- meaning a disabled student/teacher's browser session (or a copy of its
-- token) could keep reading their own enrollments/attendance/submissions/
-- receipts/payslips/reminders indefinitely via a direct PostgREST call —
-- bypassing the app's own requireRole/assertRole gate entirely.
--
-- NOTE: profiles_self_read / profiles_self_update are intentionally NOT
-- touched here. A pending or disabled user must still be able to read their
-- OWN profile row (status included) — /access-pending and /access-revoked
-- render based on that read via getProfile(), and self-write is already
-- column-limited to full_name/class_level (0001), so the exposure there is
-- low (you can only see/rename your own already-known account) and adding a
-- status filter would break those two pages.

create or replace function is_self_active(p_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from profiles p
    where p.id = p_id and p.auth_user_id = auth.uid() and p.status = 'active'
  )
$$;

-- enrollments: disabled student could still see their own enrollment rows
drop policy if exists enrollments_read on enrollments;
create policy enrollments_read on enrollments for select using (
  is_active_admin()
  or teaches_class(class_id)
  or is_self_active(student_id)
);

-- class_teachers: disabled teacher could still see their own assignment rows
drop policy if exists class_teachers_read on class_teachers;
create policy class_teachers_read on class_teachers for select using (
  is_active_admin()
  or is_self_active(teacher_id)
);

-- mentorships: disabled teacher/student could still see mentorship links
drop policy if exists mentorships_read on mentorships;
create policy mentorships_read on mentorships for select using (
  is_active_admin()
  or is_self_active(teacher_id)
  or is_self_active(student_id)
);

-- submissions: disabled student could still read their own submissions, and
-- (post-0009, is_active-only) toggle is_active on them
drop policy if exists submissions_read on submissions;
create policy submissions_read on submissions for select using (
  is_active_admin()
  or exists (select 1 from assignments a where a.id = assignment_id and teaches_class(a.class_id))
  or is_self_active(student_id)
  or mentors_student(student_id)
);

drop policy if exists submissions_update on submissions;
create policy submissions_update on submissions for update using (
  is_active_admin()
  or is_self_active(student_id)
) with check (
  is_active_admin()
  or is_self_active(student_id)
);

-- comments: disabled student could still read/post comments on their own
-- (pre-existing) submissions
drop policy if exists comments_read on comments;
create policy comments_read on comments for select using (
  is_active_admin()
  or (
    entity_type = 'submission'
    and exists (
      select 1 from submissions s
      where s.id = entity_id
      and (
        is_self_active(s.student_id)
        or exists (select 1 from assignments a where a.id = s.assignment_id and teaches_class(a.class_id))
        or mentors_student(s.student_id)
      )
    )
  )
  or (
    entity_type = 'resource'
    and exists (
      select 1 from resources r
      where r.id = entity_id
      and (teaches_class(r.class_id) or (is_enrolled(r.class_id) and r.status = 'active'))
    )
  )
  or (
    entity_type = 'meet'
    and exists (
      select 1 from meet_links m
      where m.id = entity_id
      and (m.class_id is null or teaches_class(m.class_id) or is_enrolled(m.class_id))
    )
  )
);

drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert with check (
  is_active_admin()
  or (
    is_self_active(author_id)
    and (
      (
        entity_type = 'submission'
        and exists (
          select 1 from submissions s
          where s.id = entity_id
          and (
            is_self_active(s.student_id)
            or exists (select 1 from assignments a where a.id = s.assignment_id and teaches_class(a.class_id))
            or mentors_student(s.student_id)
          )
        )
      )
      or (
        entity_type = 'resource'
        and exists (
          select 1 from resources r
          where r.id = entity_id
          and (teaches_class(r.class_id) or (is_enrolled(r.class_id) and r.status = 'active'))
        )
      )
      or (
        entity_type = 'meet'
        and exists (
          select 1 from meet_links m
          where m.id = entity_id
          and (m.class_id is null or teaches_class(m.class_id) or is_enrolled(m.class_id))
        )
      )
    )
  )
);

-- receipts / pay slips: disabled student/teacher could still read their own
-- financial documents indefinitely
drop policy if exists receipts_read on receipts;
create policy receipts_read on receipts for select using (
  is_active_admin()
  or is_self_active(student_id)
);

drop policy if exists receipt_lines_read on receipt_lines;
create policy receipt_lines_read on receipt_lines for select using (
  is_active_admin()
  or exists (
    select 1 from receipts r join profiles p on p.id = r.student_id
    where r.id = receipt_id and p.auth_user_id = auth.uid() and p.status = 'active'
  )
);

drop policy if exists payslips_read on payslips;
create policy payslips_read on payslips for select using (
  is_active_admin()
  or is_self_active(teacher_id)
);

drop policy if exists payslip_lines_read on payslip_lines;
create policy payslip_lines_read on payslip_lines for select using (
  is_active_admin()
  or exists (
    select 1 from payslips ps join profiles p on p.id = ps.teacher_id
    where ps.id = payslip_id and p.auth_user_id = auth.uid() and p.status = 'active'
  )
);

-- reminders: disabled user could still create/read/delete their own reminders
drop policy if exists reminders_all on reminders;
create policy reminders_all on reminders for all using (
  is_self_active(user_id)
);

-- attendance: disabled student could still read their own attendance history
drop policy if exists attendance_read on attendance;
create policy attendance_read on attendance for select using (
  is_active_admin()
  or teaches_class(class_id)
  or is_self_active(student_id)
  or mentors_student(student_id)
);
