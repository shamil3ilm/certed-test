-- Class content: announcements, resources, assignments, submissions, meet links,
-- and the one polymorphic comments table. Depends on 0001 (helpers) and 0002
-- (classes, is_enrolled, teaches_class, mentors_student).

-- ── Announcements ────────────────────────────────────────────────────────────
create table announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete cascade,  -- null = global
  title text not null,
  message text not null,
  author_id uuid references profiles(id) on delete set null,
  status text not null default 'active',          -- 'active' | 'archived'
  created_at timestamptz not null default now()
);
create index announcements_class_created_idx on announcements (class_id, created_at desc);

alter table announcements enable row level security;
create policy announcements_read on announcements for select using (
  is_active_admin()
  or (class_id is null and current_status() = 'active' and status = 'active')
  or (is_enrolled(class_id) and status = 'active')
  or teaches_class(class_id)
);
create policy announcements_insert on announcements for insert with check (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
);
create policy announcements_update on announcements for update using (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
) with check (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
);

-- ── Resources (Google Drive links) ───────────────────────────────────────────
create table resources (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  drive_link text,                                 -- the Google Drive share link
  uploaded_by uuid references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index resources_class_idx on resources (class_id);

alter table resources enable row level security;
create policy resources_read on resources for select using (
  is_active_admin()
  or (is_enrolled(class_id) and status = 'active')
  or teaches_class(class_id)
);
create policy resources_insert on resources for insert with check (
  is_active_admin() or teaches_class(class_id)
);
create policy resources_update on resources for update using (
  is_active_admin() or teaches_class(class_id)
) with check (
  is_active_admin() or teaches_class(class_id)
);

-- ── Assignments + submissions ────────────────────────────────────────────────
create table assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz not null,                 -- absolute instant (UTC)
  attachment_drive_link text,                    -- optional Google Drive brief link
  created_by uuid references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index assignments_class_idx on assignments (class_id);
create index assignments_status_due_idx on assignments (status, due_date);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  drive_link text,                               -- the Google Drive share link
  file_name text,                                -- display name captured via the Drive Picker
  status text not null check (status in ('submitted', 'late')),  -- vs absolute due_date
  submitted_at timestamptz not null default now(),
  is_active boolean not null default true,       -- latest wins; prior kept as history
  created_at timestamptz not null default now()
);
create unique index submissions_one_active on submissions (assignment_id, student_id) where is_active;
create index submissions_student_idx on submissions (student_id, is_active);

alter table assignments enable row level security;
alter table submissions enable row level security;
create policy assignments_read on assignments for select using (
  is_active_admin()
  or (is_enrolled(class_id) and status = 'active')
  or teaches_class(class_id)
);
create policy assignments_insert on assignments for insert with check (
  is_active_admin() or teaches_class(class_id)
);
create policy assignments_update on assignments for update using (
  is_active_admin() or teaches_class(class_id)
) with check (
  is_active_admin() or teaches_class(class_id)
);

-- submissions: student reads/writes own; teacher-of-class + the student's mentor read; admin all.
create policy submissions_read on submissions for select using (
  is_active_admin()
  or exists (select 1 from assignments a where a.id = assignment_id and teaches_class(a.class_id))
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
  or mentors_student(student_id)
);
create policy submissions_insert on submissions for insert with check (
  exists (
    select 1 from assignments a
    where a.id = assignment_id and a.status = 'active' and is_enrolled(a.class_id)
  )
  and exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
);
create policy submissions_update on submissions for update using (
  is_active_admin()
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
) with check (
  is_active_admin()
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
);

-- ── Meet links ───────────────────────────────────────────────────────────────
create table meet_links (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete cascade,  -- null = global
  title text not null,
  url text not null,
  description text,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index meet_links_class_idx on meet_links (class_id);

alter table meet_links enable row level security;
create policy meet_links_read on meet_links for select using (
  is_active_admin()
  or (class_id is null and current_status() = 'active')
  or teaches_class(class_id)
  or is_enrolled(class_id)
);
create policy meet_links_write on meet_links for all using (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
) with check (
  is_active_admin() or (class_id is not null and teaches_class(class_id))
);

-- ── Comments (one polymorphic table for submissions / resources / meet links) ─
create table comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('submission', 'resource', 'meet')),
  entity_id uuid not null,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index comments_entity_idx on comments (entity_type, entity_id, created_at);

alter table comments enable row level security;
-- Read: can the current user see the parent entity? (RLS dispatches on entity_type.)
create policy comments_read on comments for select using (
  is_active_admin()
  or (
    entity_type = 'submission'
    and exists (
      select 1 from submissions s
      where s.id = entity_id
      and (
        s.student_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
        or exists (select 1 from assignments a where a.id = s.assignment_id and teaches_class(a.class_id))
        or mentors_student(s.student_id)
      )
    )
  )
  or (
    entity_type = 'resource'
    and exists (
      select 1 from resources r
      where r.id = entity_id
      and (teaches_class(r.class_id) or (is_enrolled(r.class_id) and r.status = 'active'))
    )
  )
  or (
    entity_type = 'meet'
    and exists (
      select 1 from meet_links m
      where m.id = entity_id
      and (m.class_id is null or teaches_class(m.class_id) or is_enrolled(m.class_id))
    )
  )
);
-- Insert requires authorship + the same access as reading.
create policy comments_insert on comments for insert with check (
  is_active_admin()
  or (
    author_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
    and (
      (
        entity_type = 'submission'
        and exists (
          select 1 from submissions s
          where s.id = entity_id
          and (
            s.student_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
            or exists (select 1 from assignments a where a.id = s.assignment_id and teaches_class(a.class_id))
            or mentors_student(s.student_id)
          )
        )
      )
      or (
        entity_type = 'resource'
        and exists (
          select 1 from resources r
          where r.id = entity_id
          and (teaches_class(r.class_id) or (is_enrolled(r.class_id) and r.status = 'active'))
        )
      )
      or (
        entity_type = 'meet'
        and exists (
          select 1 from meet_links m
          where m.id = entity_id
          and (m.class_id is null or teaches_class(m.class_id) or is_enrolled(m.class_id))
        )
      )
    )
  )
);
