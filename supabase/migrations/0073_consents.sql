-- 0073: consent records - an append-only log of what each person accepted, and when.
--
-- Backs the DPDP/GCC consent model captured at registration / re-acceptance:
--   * which Terms and Privacy Policy VERSION was accepted,
--   * whether a GUARDIAN consented (for a minor),
--   * whether CROSS-BORDER storage was consented to (personal data is held in
--     Singapore; serving India/GCC is a cross-border transfer),
--   * the person's JURISDICTION, for per-state handling.
-- One row per acceptance; rows are never updated (an audit trail). The app writes
-- consent through the service-role client; a person may read their own history.
-- Depends on 0001 (profiles, is_active_admin).

create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  guardian_consent boolean not null default false,
  cross_border_consent boolean not null default false,
  jurisdiction text,
  accepted_at timestamptz not null default now()
);

create index if not exists consents_profile_idx on consents (profile_id);

alter table consents enable row level security;

-- A person may READ their own consent history (a data-subject right); an admin reads all.
-- There is deliberately NO insert/update/delete policy: consent rows are written by the
-- service role only (the app records acceptance) and are immutable once written - RLS
-- denies any authenticated/anon write even though the Data API exposes the table.
drop policy if exists consents_read on consents;
create policy consents_read on consents for select using (
  is_active_admin()
  or exists (
    select 1 from profiles p where p.id = consents.profile_id and p.auth_user_id = auth.uid()
  )
);
