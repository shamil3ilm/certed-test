-- 0088_profile_erasure.sql
-- N-04: give the data-erasure right a durable marker. eraseUser (admin-only, on an already-
-- revoked account) anonymises a person's PII in-place - keeping the profile ROW so audit and
-- finance references stay intact (their lawful-basis retention) - and stamps erased_at. The
-- marker lets restore refuse an erased account (its login + PII are gone, so "restoring" it
-- would resurrect a broken, nameless active user) and lets listings mark it as erased.
--
-- Depends on 0001 (profiles).

begin;

alter table profiles add column if not exists erased_at timestamptz;

commit;
