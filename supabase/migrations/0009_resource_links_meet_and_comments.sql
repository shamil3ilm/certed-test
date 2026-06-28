-- Migration 0009: Resource Links, Meet links, and Commenting tables

-- 1. Make drive_file_id nullable in resources table (to support direct link resources)
alter table resources alter column drive_file_id drop not null;

-- 2. Create meet_links table
create table meet_links (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade, -- null = global Meet link visible to all
  title text not null,
  url text not null,
  description text,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table meet_links enable row level security;

-- RLS policies for meet_links
create policy meet_links_read on meet_links for select using (
  is_active_admin()
  or (course_id is null and current_status() = 'active')
  or teaches_course(course_id)
  or is_enrolled(course_id)
);

create policy meet_links_write on meet_links for all using (
  is_active_admin()
  or (course_id is not null and teaches_course(course_id))
) with check (
  is_active_admin()
  or (course_id is not null and teaches_course(course_id))
);

-- 3. Create resource_comments table
create table resource_comments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table resource_comments enable row level security;

-- RLS policies for resource_comments
create policy resource_comments_read on resource_comments for select using (
  is_active_admin()
  or exists (
    select 1 from resources r
    where r.id = resource_id
    and (
      teaches_course(r.course_id)
      or (is_enrolled(r.course_id) and r.status = 'active')
    )
  )
);

create policy resource_comments_insert on resource_comments for insert with check (
  is_active_admin()
  or (
    author_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
    and exists (
      select 1 from resources r
      where r.id = resource_id
      and (
        teaches_course(r.course_id)
        or (is_enrolled(r.course_id) and r.status = 'active')
      )
    )
  )
);

-- 4. Create meet_comments table
create table meet_comments (
  id uuid primary key default gen_random_uuid(),
  meet_link_id uuid not null references meet_links(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table meet_comments enable row level security;

-- RLS policies for meet_comments
create policy meet_comments_read on meet_comments for select using (
  is_active_admin()
  or exists (
    select 1 from meet_links m
    where m.id = meet_link_id
    and (
      m.course_id is null
      or teaches_course(m.course_id)
      or is_enrolled(m.course_id)
    )
  )
);

create policy meet_comments_insert on meet_comments for insert with check (
  is_active_admin()
  or (
    author_id = (select p.id from profiles p where p.auth_user_id = auth.uid())
    and exists (
      select 1 from meet_links m
      where m.id = meet_link_id
      and (
        m.course_id is null
        or teaches_course(m.course_id)
        or is_enrolled(m.course_id)
      )
    )
  )
);
