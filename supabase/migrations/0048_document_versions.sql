-- 0048_document_versions.sql
--
-- Document version history. A document in the library (`resources`)
-- is a Google Drive link plus metadata; when a tutor replaces the link or edits
-- the content, the PRIOR state is snapshotted here instead of being lost, so a
-- past question paper / practice sheet can still be found and restored.
--
-- The live document stays in `resources` (always the current version); this
-- table only holds superseded states. Writes go through the service under the
-- service role (gated by canDocument), matching class_sessions/attendance - so
-- no INSERT policy is needed, only a read policy that mirrors resources_read.

begin;

create table if not exists resource_versions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  version_no integer not null,
  title text not null,
  drive_link text,
  description text,
  category document_category not null default 'general_documents',
  subject text,
  file_type text,
  -- Author of THIS version's content (best-effort: the resource's uploaded_by at
  -- snapshot time). Null-safe if that profile is later removed.
  created_by uuid references profiles(id) on delete set null,
  -- Why this version was archived, e.g. "Replaced" / "Restored v2".
  note text,
  created_at timestamptz not null default now(),
  unique (resource_id, version_no)
);

-- History reads are always "newest first for one document".
create index if not exists resource_versions_resource_idx on resource_versions (resource_id, version_no desc);

alter table resource_versions enable row level security;

-- A version is visible to exactly whoever may read its parent document today:
-- admin + teachers-of-class see all; an enrolled student sees history only while
-- the current document is active + class-visible (a doc later hidden to staff
-- takes its history with it). Mirrors the resources_read policy from 0045.
drop policy if exists resource_versions_read on resource_versions;
create policy resource_versions_read on resource_versions for select using (
  exists (
    select 1 from resources r
    where r.id = resource_versions.resource_id
      and (
        is_active_admin()
        or teaches_class(r.class_id)
        or (is_enrolled(r.class_id) and r.status = 'active' and r.visibility = 'class')
      )
  )
);

commit;
