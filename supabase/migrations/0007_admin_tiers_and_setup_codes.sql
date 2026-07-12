-- Admin tiers + password self-registration. Depends on 0001 (profiles, user_role).
--
-- Adds the `sub_admin` role (full teacher/student user management; the admin tier
-- stays with `admin` = Super Admin) and one-time setup codes so allowlisted users
-- can register a password without Google.

-- New enum value. ADD VALUE cannot be *used* in the same transaction it is added,
-- but nothing here references it, so this is safe. IF NOT EXISTS makes it idempotent.
alter type user_role add value if not exists 'sub_admin';

-- One-time setup code (stored hashed) an admin issues for self-registration. Read
-- and written only by the service-role server actions — never exposed to clients.
alter table profiles add column if not exists setup_code_hash text;
alter table profiles add column if not exists setup_code_expires_at timestamptz;

-- No RLS change: is_active_admin() stays `role = 'admin'` only, so a sub_admin gets
-- no broad database access; their user-management runs through gated service-role actions.
