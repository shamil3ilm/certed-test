-- ============================================================================
-- Cert-Ed Academia - seed the bootstrap super admins
--
-- Delivered for the Supabase SQL editor as PROD-4_seed_super_admins.sql; the two
-- are the same file. Run AFTER the rebuild snapshot. Safe to re-run.
-- ============================================================================
--
-- WHAT THIS IS FOR
-- A brand-new database has no accounts, and the app never lets anyone self-sign-up:
-- registration binds to an admin-created allowlist row. So the first admin has to be
-- put in by hand; everyone else is created from the UI afterwards.
--
-- THIS FILE IS THE GOOGLE SIGN-IN PATH. It creates each row as 'pending' with NO
-- setup code, which is all an OAuth first login needs:
--   * bindProfileOnFirstLogin matches the allowlist row by lowercased email;
--   * claimAllowlistRowOnOAuth updates it WHERE auth_user_id IS NULL AND status =
--     'pending', binding the Google user and flipping it to 'active' in one step.
-- No code is read on that path, so none is issued here. (That same guard is why a
-- revoked invite can never be re-activated by signing in with Google.)
--
-- Guardian consent does NOT block this: requiresGuardianConsent returns false for any
-- non-student role, so an 'admin' row activates on first Google login. A STUDENT row
-- would be refused here by design - the academy is KG-12, students are treated as
-- minors unless a date of birth proves otherwise, and Google sign-in captures no
-- guardian attestation.
--
-- IF YOU NEED A PASSWORD FALLBACK INSTEAD, do not use this file - run
--   node --env-file=.env.local scripts/seed-production-allowlist.mjs <email>
-- which issues a one-time setup code (printed once) for /register. A row created here
-- has no code, so it can ONLY be claimed with Google.
--
-- SAFETY
-- `on conflict (email) do nothing` - an already-seeded or already-registered account is
-- left exactly as it is. Nothing here can unbind, downgrade or re-code a live account.
--
-- Emails MUST be lowercase: profiles carries CHECK (email = lower(email)), and the
-- lookup on first login lowercases what the provider returns before matching.
-- ============================================================================

insert into public.profiles (email, full_name, role, status)
values
  ('info@certedacademia.com', 'Academy Admin', 'admin', 'pending'),
  ('shamil3ilm@gmail.com', 'Academy Admin', 'admin', 'pending')
on conflict (email) do nothing;

-- Last statement on purpose: the dashboard shows only the final result set, so this is
-- what you will actually see.
--
-- EXPECT 2 rows, role 'admin'. status is 'pending' and auth_user_id is empty until that
-- person signs in with Google for the first time, which flips them to 'active'. A row
-- that already shows 'active' with an auth_user_id is a registered account this run
-- deliberately left untouched.
select email, full_name, role, status, auth_user_id
from public.profiles
where email in ('info@certedacademia.com', 'shamil3ilm@gmail.com')
order by email;
