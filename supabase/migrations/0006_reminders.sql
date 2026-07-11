-- Personal reminders shown on the dashboard. Each user manages only their own.
-- Depends on 0001 (profiles).

create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  remind_at timestamptz not null,
  is_sent boolean not null default false,
  created_at timestamptz not null default now()
);
create index reminders_user_idx on reminders (user_id);

alter table reminders enable row level security;
create policy reminders_all on reminders for all using (
  exists (select 1 from profiles p where p.id = user_id and p.auth_user_id = auth.uid())
);
