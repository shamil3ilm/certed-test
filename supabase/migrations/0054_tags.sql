-- 0054_tags.sql
--
-- A generic tagging system for organisation + management across the app. A tag is
-- a shared label; entity_tags attaches it to ANY entity by (entity_type, entity_id)
-- - the same polymorphic shape as `comments`. So one system tags classes today and
-- documents / assignments / students tomorrow with no schema change.
--
-- Access: reads are open to any active user (tags are low-sensitivity labels; the
-- UI only shows tag editors to staff). Writes go through the service under the
-- service role, gated on the caller's permission for the specific entity - so a
-- tutor tags a class they manage, an admin tags anything.

begin;

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Optional tone keyword the UI maps to a chip colour (e.g. 'primary', 'emerald').
  color text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Case-insensitive unique names, so "Priority" and "priority" don't both exist.
create unique index if not exists tags_name_unique on tags (lower(name));

create table if not exists entity_tags (
  tag_id uuid not null references tags(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tag_id, entity_type, entity_id)
);
create index if not exists entity_tags_entity_idx on entity_tags (entity_type, entity_id);
create index if not exists entity_tags_tag_idx on entity_tags (tag_id);

alter table tags enable row level security;
alter table entity_tags enable row level security;

-- Reads: any ACTIVE user. Writes: no policy -> denied to anon/authenticated; the
-- service role (used by the gated domain in src/lib/services/tags) does the writes.
drop policy if exists tags_read on tags;
create policy tags_read on tags for select using (current_status() = 'active');
drop policy if exists entity_tags_read on entity_tags;
create policy entity_tags_read on entity_tags for select using (current_status() = 'active');

commit;
