-- 0072: data minimisation - drop the unused gender and address columns from profiles.
--
-- Per the DPDP data-minimisation review, neither field has a functional use and the app
-- no longer collects, displays, or reads them. Dropping the columns also removes their
-- column-level UPDATE grant (added in 0065) automatically. Depends on 0064, which added
-- the columns.

begin;

alter table profiles drop column if exists gender;
alter table profiles drop column if exists address;

commit;
