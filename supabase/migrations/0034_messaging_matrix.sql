-- 0034_messaging_matrix.sql
-- Admin-configurable messaging matrix: which persona pairs may message each other
-- GLOBALLY, layered additively on top of the fixed direct-contact default. Stored
-- as a JSONB object of canonical sorted keys -> true, e.g. { "admin|student": true }.
-- An empty {} (the default) means "direct contacts only". Parsing/consumption lives
-- in src/lib/messaging/matrix.ts + recipient-policy.ts.
--
-- org_settings is the singleton institutional-config row; its RLS is already
-- admin-only (0017), and the matrix is read service-side by the messaging policy
-- and written only through the admin-gated settings action.
alter table public.org_settings
  add column if not exists messaging_matrix jsonb not null default '{}'::jsonb;
