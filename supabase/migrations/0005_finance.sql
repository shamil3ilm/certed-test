-- Finance: receipts (students) + pay slips (teachers), immutable once issued
-- (correction = void + reissue). PDFs are generated on demand, not stored.
-- Depends on 0001 (helpers).

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
  voided boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index receipts_student_idx on receipts (student_id);
create index receipts_created_idx on receipts (created_at desc);

create table receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  subject text not null,
  hours numeric(8,2) not null,
  rate numeric(12,2) not null,
  amount numeric(12,2) not null
);
create index receipt_lines_receipt_idx on receipt_lines (receipt_id);

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
  voided boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index payslips_teacher_idx on payslips (teacher_id);
create index payslips_created_idx on payslips (created_at desc);

create table payslip_lines (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references payslips(id) on delete cascade,
  label text not null,
  hours numeric(8,2) not null,
  rate numeric(12,2) not null,
  amount numeric(12,2) not null
);
create index payslip_lines_payslip_idx on payslip_lines (payslip_id);

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

-- Per-currency, non-voided totals computed in SQL (no rows shipped to the app).
-- SECURITY INVOKER (default) so RLS applies: an admin sees all, anyone else only
-- their own rows.
create or replace function finance_totals(p_kind text)
returns table (currency text, live_total numeric, live_count bigint)
language sql
stable
as $$
  select r.currency, coalesce(sum(r.total), 0)::numeric, count(*)::bigint
  from receipts r
  where p_kind = 'receipt' and r.voided = false
  group by r.currency
  union all
  select p.currency, coalesce(sum(p.total), 0)::numeric, count(*)::bigint
  from payslips p
  where p_kind = 'payslip' and p.voided = false
  group by p.currency;
$$;
