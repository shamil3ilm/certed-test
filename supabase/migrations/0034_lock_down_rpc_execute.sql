-- 0034: lock down SECURITY DEFINER function EXECUTE grants (Supabase linter 0028/0029/0011).
--
-- Postgres grants EXECUTE to PUBLIC on every new function, so anon + authenticated
-- could call these via /rest/v1/rpc directly. Two classes:
--   A) service-role-only functions the app invokes ONLY via admin.rpc, that do NOT
--      self-authorize -> a signed-in user could forge receipts/pay slips, bump the
--      document counter, or edit any assignment. Restrict to service_role. (HIGH)
--   B) RLS-helper functions used INSIDE policies -> `authenticated` MUST keep
--      EXECUTE or every query breaks; only drop the anon/PUBLIC grant. (LOW)
-- Idempotent (revoke/grant are declarative). No app change: user-client RPCs
-- (teaches_class, finance_totals, replace_own_submission) keep authenticated.

-- ── A) Service-role-only: strip PUBLIC/anon/authenticated, grant service_role ──
revoke execute on function public.issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) to service_role;

revoke execute on function public.issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb) to service_role;

revoke execute on function public.next_document_number(text, integer) from public, anon, authenticated;
grant  execute on function public.next_document_number(text, integer) to service_role;

revoke execute on function public.edit_assignment_and_reclassify(uuid, text, text, timestamptz, text, text, numeric) from public, anon, authenticated;
grant  execute on function public.edit_assignment_and_reclassify(uuid, text, text, timestamptz, text, text, numeric) to service_role;

-- Trigger + maintenance functions: never meant to be RPC-callable. Triggers still
-- fire on DML regardless of EXECUTE grants, so revoking all is safe.
revoke execute on function public.set_submission_status() from public, anon, authenticated;
revoke execute on function public.reclassify_submissions_on_due_change() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- ── search_path hardening (the one function the linter flagged as mutable) ─────
alter function public.finance_totals(text) set search_path = public;

-- ── B) RLS-helper functions: drop anon/PUBLIC, KEEP authenticated (RLS needs it) ──
do $$
declare
  sig text;
  sigs text[] := array[
    'public.current_app_role()',
    'public.current_profile_id()',
    'public.current_status()',
    'public.is_active_admin()',
    'public.is_conversation_member(uuid)',
    'public.is_enrolled(uuid)',
    'public.is_self_active(uuid)',
    'public.mentors_student(uuid)',
    'public.teaches_class(uuid)',
    'public.user_has_persona(uuid, public.persona_name, public.persona_scope_type, uuid)',
    'public.user_is_admin(uuid)',
    'public.user_is_mentor_for_student(uuid, uuid)',
    'public.replace_own_submission(uuid, text, text)',
    'public.finance_totals(text)'
  ];
begin
  foreach sig in array sigs loop
    execute format('revoke execute on function %s from public, anon', sig);
    execute format('grant execute on function %s to authenticated', sig);
  end loop;
end $$;

-- ── Prevent recurrence: deny EXECUTE to PUBLIC on FUTURE functions ────────────
-- Postgres auto-grants EXECUTE to PUBLIC on every new function - the root cause of
-- these warnings. Deny by default (run as the migration role `postgres`, so it
-- governs functions this project creates in `public`).
--
-- WORKFLOW CHANGE: after this, a newly created OR `create or replace`d function is
-- callable only by roles you explicitly grant. Every future function migration MUST
-- end with the right grant, or the call fails loud in testing:
--   grant execute on function public.<name>(<args>) to authenticated;  -- RLS helper / user-client RPC
--   grant execute on function public.<name>(<args>) to service_role;   -- admin-only RPC (admin.rpc)
-- Secure default: a forgotten grant breaks a call in testing rather than silently
-- exposing an admin RPC to every signed-in user.
alter default privileges in schema public revoke execute on functions from public;
