-- Migration 0033: remove class_level from the self-service UPDATE grant on
--                 profiles - a signed-in user may change only their own name.
--
-- Why: 0001 granted `update (full_name, class_level)` on profiles to the
-- `authenticated` role. class_level is meant to be ADMIN-controlled - the app
-- deliberately never exposes it to self-service (updateProfileSchema is name-only;
-- editUser is the admin path). But the column grant is the real boundary at the
-- PostgREST layer: with only the anon key + their JWT, a student can
--   PATCH /rest/v1/profiles?id=eq.<self> {"class_level": "..."}
-- and set their own grade out-of-band, contradicting the documented control model.
--
-- Fix: re-issue the self-update grant for full_name ONLY. The self-update RLS
-- policy still scopes WHICH row (own), and role/status/email/auth-binding remain
-- ungranted (no self-promotion). Admin writes are unaffected: editUser ->
-- updateProfile uses the service-role client, which bypasses these column grants.
--
-- Idempotent: revoke-all-then-grant mirrors the 0001 idiom and re-runs cleanly.

revoke update on table profiles from authenticated;
grant update (full_name) on table profiles to authenticated;
