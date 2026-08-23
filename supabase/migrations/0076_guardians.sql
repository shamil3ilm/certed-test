-- 0076: guardian contacts - one row per parent/guardian of a student (both parents
-- when applicable). A normalized one-to-many that replaces the single flat
-- guardian_name/guardian_phone on profiles and adds email. ADDITIVE: the flat columns
-- are LEFT in place until the app is migrated to read/write this table, then dropped in
-- a later migration (same safe order as any column removal - code first, drop after).
-- Depends on 0001 (profiles, is_active_admin, is_self_active).

create table if not exists guardians (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references profiles(id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  relationship text,                 -- optional: 'mother' / 'father' / 'guardian'
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists guardians_student_idx on guardians (student_id);

alter table guardians enable row level security;

-- Guardian contacts are admin/staff-managed (like the other admin-owned profile fields);
-- the student may READ their own (a data-subject transparency right). Writes go through
-- the service role after the app's canManageTarget tier check - there is deliberately NO
-- insert/update/delete policy, so RLS denies any authenticated/anon write even though the
-- Data API exposes the table.
drop policy if exists guardians_read on guardians;
create policy guardians_read on guardians for select using (
  is_active_admin() or is_self_active(student_id)
);
