-- 0089_audit_metadata.sql
-- Give the audit trail room for structured before/after detail. Session-time edits (and any
-- future change worth diffing) can now record the previous and new values alongside the
-- who/what/when, so a reviewer sees exactly what changed - not just that something did.
-- Nullable and free-form (jsonb): existing audit rows and callers that pass no detail are
-- unaffected.
--
-- Depends on 0002 (audit_log).

begin;

alter table audit_log add column if not exists metadata jsonb;

commit;
