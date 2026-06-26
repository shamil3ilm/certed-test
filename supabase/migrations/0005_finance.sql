-- Phase 4 — Finance: receipts (students) + pay slips (teachers), both immutable
-- once issued (correction = void + reissue). Depends on 0001 (helpers).

create table receipts (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,                   -- e.g. CEA-R-2026-0001
  student_id uuid references profiles(id) on delete set null,
  student_name_snapshot text not null,
  class_snapshot text,
  issue_date date not null default current_date,
  currency text not null,
  note text,
  subtotal numeric(12,2) not null,
  discount numeric(12,2),
  total numeric(12,2) not null,                  -- subtotal - coalesce(discount,0)
  drive_file_id text,
  drive_link text,
  voided boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  subject text not null,
  hours numeric(8,2) not null,
  rate numeric(12,2) not null,
  amount numeric(12,2) not null
);

create table payslips (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,                   -- e.g. CEA-P-2026-0001
  teacher_id uuid references profiles(id) on delete set null,
  teacher_name_snapshot text not null,
  issue_date date not null default current_date,
  currency text not null,
  note text,
  subtotal numeric(12,2) not null,
  discount numeric(12,2),
  total numeric(12,2) not null,
  drive_file_id text,
  drive_link text,
  voided boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table payslip_lines (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references payslips(id) on delete cascade,
  label text not null,
  hours numeric(8,2) not null,
  rate numeric(12,2) not null,
  amount numeric(12,2) not null
);

create table document_counters (
  doc_type text not null,                        -- 'receipt' | 'payslip'
  year int not null,
  last_number int not null default 0,
  primary key (doc_type, year)
);

-- Concurrency-safe sequential allocator (atomic upsert returns the new value).
create or replace function next_document_number(p_doc_type text, p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into document_counters (doc_type, year, last_number)
  values (p_doc_type, p_year, 1)
  on conflict (doc_type, year)
    do update set last_number = document_counters.last_number + 1
  returning last_number into n;
  return n;
end $$;

alter table receipts enable row level security;
alter table receipt_lines enable row level security;
alter table payslips enable row level security;
alter table payslip_lines enable row level security;
alter table document_counters enable row level security;

-- receipts: a student reads their own; admin reads/writes all.
create policy receipts_read on receipts for select using (
  is_active_admin()
  or exists (select 1 from profiles p where p.id = student_id and p.auth_user_id = auth.uid())
);
create policy receipts_admin_write on receipts for all
  using (is_active_admin()) with check (is_active_admin());
create policy receipt_lines_read on receipt_lines for select using (
  is_active_admin()
  or exists (
    select 1 from receipts r join profiles p on p.id = r.student_id
    where r.id = receipt_id and p.auth_user_id = auth.uid()
  )
);
create policy receipt_lines_admin_write on receipt_lines for all
  using (is_active_admin()) with check (is_active_admin());

-- pay slips: a teacher reads their own; admin reads/writes all.
create policy payslips_read on payslips for select using (
  is_active_admin()
  or exists (select 1 from profiles p where p.id = teacher_id and p.auth_user_id = auth.uid())
);
create policy payslips_admin_write on payslips for all
  using (is_active_admin()) with check (is_active_admin());
create policy payslip_lines_read on payslip_lines for select using (
  is_active_admin()
  or exists (
    select 1 from payslips ps join profiles p on p.id = ps.teacher_id
    where ps.id = payslip_id and p.auth_user_id = auth.uid()
  )
);
create policy payslip_lines_admin_write on payslip_lines for all
  using (is_active_admin()) with check (is_active_admin());

create policy counters_admin on document_counters for all
  using (is_active_admin()) with check (is_active_admin());
