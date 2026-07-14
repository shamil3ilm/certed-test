-- 0009: RLS hardening from a security audit. RLS is the real trust boundary — the
-- browser calls PostgREST directly with NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY + the
-- signed-in user's JWT, so any table/function that is too permissive is directly
-- exploitable regardless of the server actions.

-- ── CRITICAL: a student could grade themselves via the Data API ──────────────
-- submissions RLS scopes WHICH rows a student may write (their own) but nothing
-- scoped WHICH columns — so a student could PATCH their own row's score / feedback
-- / graded_by directly. Mirror the profiles column-grant pattern (0001): the
-- student may write only the content columns; the grading columns are written
-- only by the service-role teacher action, which bypasses these grants.
-- (This corrects the 0008 comment that claimed no RLS change was needed.)
revoke insert, update on table submissions from authenticated;
grant insert (assignment_id, student_id, drive_link, file_name, submitted_at, status, is_active)
  on table submissions to authenticated;
grant update (is_active) on table submissions to authenticated;

-- Make submitted_at + status server-authoritative, so a student can't backdate a
-- submission or fake "on time" via a direct insert. No app change — recordSubmission
-- still supplies these; the trigger just clamps them to the truth.
-- NOTE: to bulk-backfill historical submissions with real dates, disable this
-- trigger for that load (`alter table submissions disable trigger trg_submission_status`).
create or replace function set_submission_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare due timestamptz;
begin
  new.submitted_at := now();
  select due_date into due from assignments where id = new.assignment_id;
  new.status := case when due is not null and new.submitted_at > due then 'late' else 'submitted' end;
  return new;
end $$;
drop trigger if exists trg_submission_status on submissions;
create trigger trg_submission_status before insert on submissions
  for each row execute function set_submission_status();

-- ── MEDIUM: next_document_number() is SECURITY DEFINER with EXECUTE to PUBLIC, so
-- any authenticated user could increment the receipt/pay-slip counter directly and
-- create permanent numbering gaps. It's only ever called by the service-role
-- issuance path (allocateNumber → createAdminClient). ────────────────────────────
revoke execute on function next_document_number(text, int) from public;
grant execute on function next_document_number(text, int) to service_role;

-- ── MEDIUM: any active user could enumerate the whole class catalogue. Scope reads
-- to admin / a teacher of the class / an enrolled student. App pickers for
-- non-admins only ever need the caller's own classes, so this doesn't regress them.
drop policy if exists classes_read on classes;
create policy classes_read on classes for select using (
  is_active_admin() or teaches_class(id) or is_enrolled(id)
);

-- ── LOW: org_settings (incl. bank account/IFSC) was readable by any signed-in
-- principal, including non-allowlisted / disabled users. Require an active profile.
drop policy if exists org_read on org_settings;
create policy org_read on org_settings for select using (current_status() = 'active');
