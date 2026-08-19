-- 0063_drop_dead_columns.sql
-- Drops columns confirmed unused by the app (never read, and not backing any RLS
-- policy, trigger, or index):
--   resources.topic               - superseded by category/subject/description
--   org_settings.signature_mode   - rendering only uses signature_text
--   org_settings.default_currency - new-document currency comes from the issue form
-- Timestamp and provenance columns (created_at/updated_at/created_by, etc.) are
-- kept for record-keeping.

begin;

alter table resources drop column if exists topic;
alter table org_settings drop column if exists signature_mode;
alter table org_settings drop column if exists default_currency;

commit;
