-- 0096: CRITICAL - close three privilege holes of one family.
--
-- The family: `REVOKE ... FROM PUBLIC` was used where `FROM PUBLIC, anon, authenticated`
-- is required. Supabase's bootstrap default privileges grant EXECUTE on a NEW function in
-- `public` to anon and authenticated as NAMED roles, and revoking from PUBLIC does not
-- remove a grant held by a named role. 0034 knew this (it revokes "from public, anon,
-- authenticated"); later migrations and the rebuild epilogue regressed to PUBLIC only.
--
-- C-01 (incident-grade). 0095 re-signed issue_receipt_doc / issue_payslip_doc with a 13th
-- argument (p_billing_period). A new signature is a NEW function, so it was created with
-- fresh default grants and 0095's `revoke all ... from public` left anon + authenticated
-- holding EXECUTE. Both are SECURITY DEFINER and neither self-authorizes - the ACL is the
-- ONLY control on them. Anyone holding the publishable (anon) key could mint receipts and
-- pay slips, and burn document numbers, straight through /rest/v1/rpc. Reproduced against
-- a chain-provisioned database: an anon caller got PS-2026-0001 back.
--
-- Same family, also fixed here:
--   * 11 further functions (revoke_profile_guarded, claim_pending_emails, next_document_number,
--     rate_limit_hit, edit_assignment_and_reclassify, rls_disabled_tables, ...) carry the
--     PUBLIC-only revoke, so they leak EXECUTE the same way.
--   * class_sessions never had INSERT/UPDATE/DELETE revoked at TABLE level. In Postgres a
--     table-level UPDATE grant authorises EVERY column, so 0068's `grant update
--     (student_feedback)` has been decorative since it landed: the
--     class_sessions_student_feedback_update policy is TO authenticated and permits the row,
--     so an enrolled student could rewrite actual_start / actual_end - the basis of every
--     pay slip - plus tutor_id, summary and staff_note.
--
-- Idempotent: every statement is declarative (revoke/grant), safe to re-run.

-- ── 1. C-01: the two document-minting functions, named explicitly ──────────────
-- Stated in full rather than left to the sweep below, so this fix is greppable by
-- signature and cannot be silently dropped by a future refactor of the sweep.
revoke execute on function public.issue_receipt_doc(
  uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.issue_receipt_doc(
  uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text
) to service_role;

revoke execute on function public.issue_payslip_doc(
  uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.issue_payslip_doc(
  uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text
) to service_role;

-- ── 2. Sweep EVERY function in public: deny by default, allow by name ──────────
-- Fail-closed. Anything not named below loses anon + authenticated, whatever its
-- signature - so a re-signed function (the C-01 mechanism) can never reopen the hole.
-- The allowlist is the RLS-helper / user-client-RPC set: these run inside policies or
-- are called from the browser client, so `authenticated` MUST keep EXECUTE or ordinary
-- queries start failing. Matched on NAME so an argument change cannot silently drop a
-- helper out of the list and break every policy that calls it.
do $$
declare
  fn record;
  keeps_authenticated constant text[] := array[
    'current_app_role',
    'current_profile_id',
    'current_status',
    'finance_totals',
    'finance_totals_base',
    'is_active_admin',
    'is_active_sub_admin',
    'is_conversation_member',
    'is_enrolled',
    'is_http_link',
    'is_self_active',
    'mentors_class',
    'mentors_student',
    'replace_own_submission',
    'teaches_class',
    'teaches_class_write',
    'user_has_persona',
    'user_is_admin',
    'user_is_mentor_for_student'
  ];
begin
  for fn in
    select p.oid::regprocedure as sig, p.proname as name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      -- Never touch anything an extension owns: its grants are the extension's business.
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
    if fn.name = any (keeps_authenticated) then
      execute format('grant execute on function %s to authenticated', fn.sig);
    else
      -- Everything else is reachable only through the service-role client.
      execute format('grant execute on function %s to service_role', fn.sig);
    end if;
  end loop;
end $$;

-- ── 3. class_sessions: make the column grants actually mean something ──────────
-- Revoke the table-level writes that were masking them, then restore exactly the
-- column privileges 0068 intended for a student: create their own feedback row and
-- edit their own feedback text. Nothing else on this table is theirs to write.
revoke insert, update, delete on table public.class_sessions from anon, authenticated;

grant insert (class_id, session_date, student_feedback) on table public.class_sessions to authenticated;
grant update (student_feedback) on table public.class_sessions to authenticated;

-- ── 4. Stop the recurrence at the source ──────────────────────────────────────
-- 0034 denied the FUTURE default only to PUBLIC, which is why every function created
-- afterwards still arrived with anon + authenticated grants. Deny those too, so the
-- next `create function` is closed on arrival and a forgotten grant fails loudly in
-- testing instead of silently exposing an admin RPC.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
