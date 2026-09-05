-- 0095_hours_billing.sql
-- Make fee receipts and pay slips derivable from RECORDED CLASS HOURS instead of typed in.
--
-- The documents were always hours-shaped: receipt_lines and payslip_lines have carried
-- (hours, rate, amount) since the beginning. What was missing was (a) anywhere to keep an
-- hourly rate, so every line's rate was retyped from memory, and (b) any record of WHICH
-- MONTH a document bills, so nothing could tell that a student had already been invoiced
-- for September. This migration adds both. It does not change how a document is issued:
-- numbering, the atomic line insert, and void-never-delete all stay exactly as they were.
--
-- 1. billing_rates - one row per person: what a STUDENT pays per hour (fee_rate) and what a
--    TUTOR/MENTOR earns per hour (pay_rate). Its own table rather than columns on profiles,
--    for two reasons: profiles is read by every persona on nearly every page, so a money
--    column there would ride along on reads that have no business seeing it; and profiles'
--    RLS deliberately lets people read each other's basic details, which is exactly what a
--    rate must not be. Here the policy is admin-tier only, matching org_settings (0017) -
--    the same tier that already sees the academy's bank details.
--
--    currency is per person, not global: the academy bills across India AND the GCC, so a
--    rate of "400" is meaningless without saying 400 of what. Storing it beside the rate is
--    what stops an INR rate being issued onto an AED document.
--
-- 2. receipts.billing_period / payslips.billing_period - the 'YYYY-MM' the document bills
--    for, distinct from issue_date (September's fees are commonly issued in October).
--    Deliberately NOT unique: splitting one month across two documents is legitimate (two
--    subjects invoiced separately, or a correction issued after a void). The app warns on a
--    live duplicate rather than the database refusing one; the index below serves that
--    lookup.
--
-- 3. issue_receipt_doc / issue_payslip_doc gain p_billing_period. Postgres cannot add a
--    parameter in place - CREATE OR REPLACE with a new signature creates an OVERLOAD, and
--    two overloads reachable by name is exactly how an ambiguous-function error at issue
--    time happens - so each function is dropped and recreated with its ACL restored. The
--    body is otherwise unchanged. Setting the period inside the same function keeps it
--    atomic with the insert: a document can never exist without the period it bills.
--
-- Depends on 0017 (is_active_admin, org_settings), 0001 (profiles), and the original
-- finance migration that created receipts/payslips and their issue functions. Independent
-- of 0094 (attendance per session), which lands in the same batch.

begin;

-- ---------------------------------------------------------------------------
-- 1. Per-person hourly rates
-- ---------------------------------------------------------------------------

create table if not exists billing_rates (
  profile_id uuid primary key references profiles(id) on delete cascade,
  -- What this person PAYS per hour as a student. Null = not a paying student, or not set
  -- yet; the generator then reports "no rate" rather than silently billing zero.
  fee_rate numeric(16,3) check (fee_rate is null or fee_rate >= 0),
  -- What this person EARNS per hour as a tutor or mentor. Same null semantics.
  pay_rate numeric(16,3) check (pay_rate is null or pay_rate >= 0),
  -- ISO 4217, matching receipts.currency / payslips.currency.
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

comment on table billing_rates is
  'Per-person hourly rates used to derive receipt and pay-slip lines from recorded class hours. Admin-tier only - a rate is money data, not profile data.';

alter table billing_rates enable row level security;

-- Admin tier only, both directions. Sub-admins are deliberately excluded: 0092 widened that
-- persona over CLASS-scoped tables and explicitly left the finance ledger to admins.
drop policy if exists billing_rates_read on billing_rates;
create policy billing_rates_read on billing_rates
  for select using (public.is_active_admin());

drop policy if exists billing_rates_admin_write on billing_rates;
create policy billing_rates_admin_write on billing_rates
  using (public.is_active_admin()) with check (public.is_active_admin());

revoke all on table billing_rates from anon, authenticated;
grant select, insert, update, delete on table billing_rates to service_role;

-- ---------------------------------------------------------------------------
-- 2. Which month a document bills for
-- ---------------------------------------------------------------------------

alter table receipts add column if not exists billing_period text;
alter table payslips add column if not exists billing_period text;

-- 'YYYY-MM'. Enforced in the database as well as the app so a hand-run insert cannot store
-- a shape the duplicate lookup would silently miss.
alter table receipts drop constraint if exists receipts_billing_period_format;
alter table receipts add constraint receipts_billing_period_format
  check (billing_period is null or billing_period ~ '^\d{4}-(0[1-9]|1[0-2])$');

alter table payslips drop constraint if exists payslips_billing_period_format;
alter table payslips add constraint payslips_billing_period_format
  check (billing_period is null or billing_period ~ '^\d{4}-(0[1-9]|1[0-2])$');

comment on column receipts.billing_period is
  'The YYYY-MM this receipt bills for. Distinct from issue_date: a September month is often issued in October. Not unique - one month may legitimately span several documents.';
comment on column payslips.billing_period is
  'The YYYY-MM this pay slip pays for. Distinct from issue_date. Not unique - see receipts.billing_period.';

-- Serves the "is there already a LIVE document for this person and month?" warning. Partial
-- on not voided, because a voided document must never suppress the warning for its
-- replacement - re-issuing after a void is the normal correction path.
create index if not exists receipts_party_period_idx
  on receipts (student_id, billing_period) where not voided;
create index if not exists payslips_party_period_idx
  on payslips (tutor_id, billing_period) where not voided;

-- ---------------------------------------------------------------------------
-- 3. Carry the period through the issue functions
-- ---------------------------------------------------------------------------

drop function if exists public.issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb);

create function public.issue_receipt_doc(
  p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text,
  p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid,
  p_prefix text, p_lines jsonb, p_billing_period text default null
) returns public.receipts
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_year int;
  v_number text;
  v_counter int;
  v_receipt receipts%rowtype;
begin
  v_year := extract(year from p_issue_date);
  v_counter := next_document_number('receipt', v_year);
  v_number := p_prefix || '-' || v_year || '-' || lpad(v_counter::text, 4, '0');

  insert into receipts (
    number, student_id, student_name_snapshot, class_snapshot, issue_date, currency, note,
    subtotal, discount, total, voided, created_by, billing_period
  ) values (
    v_number, p_party_id, p_party_name, p_class_level, p_issue_date, p_currency, p_note,
    p_subtotal, p_discount, p_total, false, p_created_by, p_billing_period
  )
  returning * into v_receipt;

  insert into receipt_lines (receipt_id, subject, hours, rate, amount)
  select
    v_receipt.id,
    item->>'label',
    (item->>'hours')::numeric,
    (item->>'rate')::numeric,
    (item->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item;

  return v_receipt;
end;
$$;

revoke all on function public.issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text) from public;
grant all on function public.issue_receipt_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text) to service_role;

drop function if exists public.issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb);

create function public.issue_payslip_doc(
  p_party_id uuid, p_party_name text, p_class_level text, p_issue_date date, p_currency text,
  p_note text, p_subtotal numeric, p_discount numeric, p_total numeric, p_created_by uuid,
  p_prefix text, p_lines jsonb, p_billing_period text default null
) returns public.payslips
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_year int;
  v_number text;
  v_counter int;
  v_payslip payslips%rowtype;
begin
  -- p_class_level is accepted but unused: pay slips carry no class snapshot. The parameter
  -- stays so both issue functions keep one shared call shape in the data layer.
  v_year := extract(year from p_issue_date);
  v_counter := next_document_number('payslip', v_year);
  v_number := p_prefix || '-' || v_year || '-' || lpad(v_counter::text, 4, '0');

  insert into payslips (
    number, tutor_id, tutor_name_snapshot, issue_date, currency, note,
    subtotal, discount, total, voided, created_by, billing_period
  ) values (
    v_number, p_party_id, p_party_name, p_issue_date, p_currency, p_note,
    p_subtotal, p_discount, p_total, false, p_created_by, p_billing_period
  )
  returning * into v_payslip;

  insert into payslip_lines (payslip_id, label, hours, rate, amount)
  select
    v_payslip.id,
    item->>'label',
    (item->>'hours')::numeric,
    (item->>'rate')::numeric,
    (item->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item;

  return v_payslip;
end;
$$;

revoke all on function public.issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text) from public;
grant all on function public.issue_payslip_doc(uuid, text, text, date, text, text, numeric, numeric, numeric, uuid, text, jsonb, text) to service_role;

commit;
