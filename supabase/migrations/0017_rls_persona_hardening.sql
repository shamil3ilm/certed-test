-- Migration 0017: Persona-era RLS hardening
-- Purpose: Re-assert 0011 disabled-user hardening across all self-readable tables
--          and lock down sensitive settings/finance access under the persona model.
-- Status: Idempotent (drop-if-exists + create) — safe to run on any environment at 0001-0016.
-- Depends on: 0001 (is_self_active, is_active_admin), 0005 (finance tables),
--             0008 (submissions grading), 0011 (hardening pattern)
--
-- Every self-read policy uses is_self_active(profile_id) so a disabled user with a
-- stale JWT cannot read their own rows. Admin access uses is_active_admin().

-- ---------------------------------------------------------------------------
-- Disabled-user hardening: submissions, enrollments, mentorships, attendance
-- ---------------------------------------------------------------------------

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

drop policy if exists enrollments_read on enrollments;
create policy enrollments_read on enrollments for select using (
  is_active_admin()
  or teaches_class(class_id)
  or is_self_active(student_id)
);

drop policy if exists mentorships_read on mentorships;
create policy mentorships_read on mentorships for select using (
  is_active_admin()
  or is_self_active(teacher_id)
  or is_self_active(student_id)
);

drop policy if exists attendance_read on attendance;
create policy attendance_read on attendance for select using (
  is_active_admin()
  or teaches_class(class_id)
  or is_self_active(student_id)
  or mentors_student(student_id)
);

-- ---------------------------------------------------------------------------
-- Sensitive settings: org_settings readable/writable by active admins only
-- (bank account, IFSC code, and other institutional settings)
-- ---------------------------------------------------------------------------

drop policy if exists org_read on org_settings;
create policy org_read on org_settings for select using (
  is_active_admin()
);

drop policy if exists org_admin_write on org_settings;
create policy org_admin_write on org_settings for all using (
  is_active_admin()
) with check (
  is_active_admin()
);

-- ---------------------------------------------------------------------------
-- Finance hardening: receipts / receipt_lines / payslips / payslip_lines
-- A disabled student/teacher cannot read their own finance rows via stale JWT.
-- ---------------------------------------------------------------------------

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
