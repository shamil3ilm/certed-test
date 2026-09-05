-- 0098_org_contact_defaults.sql
-- Give org_settings real contact details instead of leaving them NULL.
--
-- org_settings is the single row every branded document reads: receipts and pay slips
-- (src/lib/finance/render.ts orgInfo), report cards (src/lib/report-card/render.ts) and
-- the portal footer. institute_name has defaulted to 'Cert-Ed Academia' since 0001, but
-- contact_email/contact_phone defaulted to NULL - so a fresh install printed the academy
-- name with no way to reach it, and the portal footer carried a hard-coded placeholder
-- pair (hello@certedacademia.com / +91 98765 43210) that matched nothing published.
-- Seed both from the marketing site (src/app/components/Footer.tsx, the (mkt)/contact
-- page), which is the address students and parents are actually given.
--
-- Admins can still edit these in Settings; the backfill only fills a NULL, so an academy
-- that has already entered its own details is untouched.
--
-- Depends on 0001 (org_settings). Renumbered from 0096 - that slot was taken concurrently
-- by 0096_critical_execute_and_class_sessions_acl.sql; this change is order-independent.

alter table org_settings alter column contact_email set default 'info@certedacademia.com';
alter table org_settings alter column contact_phone set default '+91 7025 237 833';

update org_settings
   set contact_email = coalesce(contact_email, 'info@certedacademia.com'),
       contact_phone = coalesce(contact_phone, '+91 7025 237 833')
 where contact_email is null
    or contact_phone is null;
