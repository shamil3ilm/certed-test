-- 0030: two schema-consistency hardening changes (both low-impact; safe to apply).

-- (1) persona_assignments.assigned_at is the ONLY bare `timestamp` (no time zone)
-- column in the schema; every other timestamp is timestamptz. now() (a
-- timestamptz) is silently cast to the session zone on write, discarding the
-- offset. No code reads it today (data/personas.ts deliberately excludes it), so
-- this is a pre-emptive fix before anything surfaces "granted on" in the UI.
-- Assumes existing values were written under a UTC session (Supabase default).
alter table persona_assignments
  alter column assigned_at type timestamptz using assigned_at at time zone 'UTC';

-- (2) profiles.email uniqueness is case-sensitive at the DB layer; case-folding
-- is an app-only convention (every write lower-cases before insert). Add a CHECK
-- as defense-in-depth so a future service-role insert or one-off admin SQL can't
-- create Foo@Bar.com alongside foo@bar.com as two allowlist rows for one mailbox.
-- NOT VALID: enforce on new/changed rows immediately without scanning existing
-- data; run `alter table profiles validate constraint profiles_email_lowercase;`
-- once you've confirmed no legacy mixed-case rows exist.
alter table profiles
  add constraint profiles_email_lowercase check (email = lower(email)) not valid;
