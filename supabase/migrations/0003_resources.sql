-- Phase 2 — Resources (Drive-stored files) + a folder-id cache.
-- Depends on 0001 (profiles, helpers) and 0002 (courses, is_enrolled, teaches_course).

create table resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  drive_file_id text,                              -- null while 'pending'; set at finalize
  drive_link text,
  uploaded_by uuid references profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'archived')),
  created_at timestamptz not null default now()
);

-- Cache of resolved Google Drive folder ids, so we don't re-walk the tree.
create table drive_folders (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,  -- null for top-level folders
  kind text not null,                                        -- e.g. 'course_root' | 'resources' | 'submissions'
  drive_folder_id text not null,
  created_at timestamptz not null default now(),
  unique (course_id, kind)
);

alter table resources enable row level security;
alter table drive_folders enable row level security;

-- resources: students read ACTIVE resources for enrolled courses; teachers manage
-- their courses; admin sees all.
create policy resources_read on resources for select using (
  is_active_admin()
  or (is_enrolled(course_id) and status = 'active')
  or teaches_course(course_id)
);
create policy resources_insert on resources for insert with check (
  is_active_admin() or teaches_course(course_id)
);
create policy resources_update on resources for update using (
  is_active_admin() or teaches_course(course_id)
) with check (
  is_active_admin() or teaches_course(course_id)
);

-- drive_folders: the cache is maintained server-side via the service-role client
-- (which bypasses RLS). Expose reads to admins only.
create policy drive_folders_admin_read on drive_folders for select using (is_active_admin());
