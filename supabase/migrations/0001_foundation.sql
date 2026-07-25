-- Foundation: profiles allowlist, org settings, role helpers, RLS.

create type user_role as enum ('admin','teacher','student');
create type user_status as enum ('active','pending','disabled');

-- The allowlist. A row may exist BEFORE the person ever signs in (admin
-- pre-creates by email), so the primary key is the row's own id and the link to
-- auth.users is a nullable `auth_user_id` that binds on first Google login.
create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text unique not null,
  full_name text,
  role user_role not null default 'student',
  status user_status not null default 'pending',
  class_level text,
  created_at timestamptz not null default now()
);

create table org_settings (
  id boolean primary key default true,        -- single-row guard
  institute_name text not null default 'Cert-Ed Academia',
  contact_email text,
  contact_phone text,
  bank_account text,
  bank_ifsc text,
  bank_branch text,
  terms_text text,
  signatory_name text,
  signatory_title text,
  signature_mode text not null default 'text',
  signature_text text default 'Digitally signed',
  default_currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  receipt_prefix text not null default 'CEA-R',
  payslip_prefix text not null default 'CEA-P',
  constraint org_settings_single_row check (id)
);

-- Role/status helpers. SECURITY DEFINER so RLS policies can read profiles
-- safely. NOTE: named current_app_role() — `current_role` is a reserved word.
create or replace function current_app_role() returns user_role
language sql security definer stable set search_path = public as $$
  select role from profiles where auth_user_id = auth.uid()
$$;
create or replace function current_status() returns user_status
language sql security definer stable set search_path = public as $$
  select status from profiles where auth_user_id = auth.uid()
$$;
create or replace function is_active_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from profiles
    where auth_user_id = auth.uid() and role = 'admin' and status = 'active'
  )
$$;

alter table profiles enable row level security;
alter table org_settings enable row level security;

-- A signed-in user can read their own profile; admins read all.
create policy profiles_self_read on profiles for select
  using (auth_user_id = auth.uid() or is_active_admin());
-- A user may update only their own row; admins update anything.
create policy profiles_self_update on profiles for update
  using (auth_user_id = auth.uid() or is_active_admin());
create policy profiles_admin_write on profiles for all
  using (is_active_admin()) with check (is_active_admin());

-- A self-service profile update may change only name / class level — never role,
-- status, email, or the auth binding. The self-update policy scopes WHICH row;
-- this restricts WHICH columns. Admin writes go through the service-role client,
-- which bypasses these column grants.
revoke update on table profiles from authenticated;
grant update (full_name, class_level) on table profiles to authenticated;

create policy org_read on org_settings for select using (auth.uid() is not null);
create policy org_admin_write on org_settings for all
  using (is_active_admin()) with check (is_active_admin());

insert into org_settings (id) values (true) on conflict do nothing;
