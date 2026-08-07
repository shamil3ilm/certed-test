-- Admin-managed multi-currency conversion.
--
-- Adds a reporting base currency plus an effective-dated exchange-rate table the
-- admin maintains by hand, and snapshots a base-currency amount onto each receipt
-- and pay slip. The converted amount is a REPORTING OVERLAY: the document's own
-- currency and total stay the legal record, while base_total lets the dashboard
-- rollups (Net card, revenue chart) read in one currency instead of a per-currency
-- list. An admin recomputes the overlay after adding or correcting a rate.

-- 1. Reporting base currency. Distinct from default_currency (the default for NEW
--    documents); this is the single currency every figure normalises INTO. Admin
--    settable; defaults to INR.
alter table org_settings add column if not exists base_currency text not null default 'INR';

-- 2. Effective-dated rates. `rate` converts ONE unit of `currency` into
--    `base_currency` (1 currency = rate base). A document uses the newest rate
--    whose effective_from is on or before its issue_date, so the same amount on
--    two different dates converts at each date's rate.
create table if not exists exchange_rates (
  id             uuid primary key default gen_random_uuid(),
  currency       text not null,
  base_currency  text not null,
  rate           numeric(18, 8) not null check (rate > 0),
  effective_from date not null,
  note           text,
  created_by     uuid references profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (currency, base_currency, effective_from)
);

create index if not exists exchange_rates_lookup_idx
  on exchange_rates (base_currency, currency, effective_from desc);

alter table exchange_rates enable row level security;

-- Rates are academy-wide config: active admins read and write, nobody else.
-- Trusted server code reads them service-role, so this only guards direct
-- PostgREST access.
drop policy if exists exchange_rates_admin_all on exchange_rates;
create policy exchange_rates_admin_all on exchange_rates for all
  using (is_active_admin()) with check (is_active_admin());

-- 3. Base-currency overlay on each document. Nullable: a document issued when no
--    rate exists yet stays unconverted until an admin adds the rate and recomputes.
--    fx_rate / fx_rate_id record the rate used, for audit and provenance.
alter table receipts
  add column if not exists base_currency text,
  add column if not exists base_total    numeric(12, 2),
  add column if not exists fx_rate        numeric(18, 8),
  add column if not exists fx_rate_id     uuid references exchange_rates (id) on delete set null;

alter table payslips
  add column if not exists base_currency text,
  add column if not exists base_total    numeric(12, 2),
  add column if not exists fx_rate        numeric(18, 8),
  add column if not exists fx_rate_id     uuid references exchange_rates (id) on delete set null;

-- 4. Backfill: stamp the current base onto existing rows; a document already in the
--    base currency converts 1:1 and needs no rate row. Everything else is left null
--    for the first admin recompute once rates are entered.
update receipts set base_currency = (select base_currency from org_settings limit 1) where base_currency is null;
update payslips set base_currency = (select base_currency from org_settings limit 1) where base_currency is null;
update receipts r set base_total = r.total, fx_rate = 1 where r.currency = r.base_currency and r.base_total is null;
update payslips p set base_total = p.total, fx_rate = 1 where p.currency = p.base_currency and p.base_total is null;

-- 5. Per-kind BASE totals for the dashboard rollups, plus how many non-void
--    documents are not yet converted so a rollup never silently understates.
--    SECURITY INVOKER (default) so RLS still scopes who can read the rows.
--    HAVING on the constant p_kind suppresses the branch for the other kind, so
--    the function returns exactly one row.
--
--    CRITICAL - never mix currencies in the sum. Amounts are converted per
--    document at its own issue_date rate; only the resulting base amounts are
--    summed, and ONLY those already priced in the CURRENT base currency. A row
--    with no base_total, or one still priced in a previous base (a base change or
--    a recompute that has not finished re-pricing it), is excluded from the sum
--    and counted as unconverted - so a partial or mixed state is flagged, never
--    silently added into a meaningless cross-currency total.
create or replace function finance_totals_base(p_kind text)
returns table (
  base_currency text,
  base_total numeric,
  converted_count bigint,
  unconverted_count bigint
)
language sql
stable
as $$
  select
    (select base_currency from org_settings limit 1),
    coalesce(
      sum(r.base_total) filter (
        where r.base_total is not null
          and r.base_currency = (select base_currency from org_settings limit 1)
      ),
      0
    )::numeric,
    count(*) filter (
      where r.base_total is not null
        and r.base_currency = (select base_currency from org_settings limit 1)
    )::bigint,
    count(*) filter (
      where r.base_total is null
        or r.base_currency is distinct from (select base_currency from org_settings limit 1)
    )::bigint
  from receipts r
  where r.voided = false
  having p_kind = 'receipt'
  union all
  select
    (select base_currency from org_settings limit 1),
    coalesce(
      sum(p.base_total) filter (
        where p.base_total is not null
          and p.base_currency = (select base_currency from org_settings limit 1)
      ),
      0
    )::numeric,
    count(*) filter (
      where p.base_total is not null
        and p.base_currency = (select base_currency from org_settings limit 1)
    )::bigint,
    count(*) filter (
      where p.base_total is null
        or p.base_currency is distinct from (select base_currency from org_settings limit 1)
    )::bigint
  from payslips p
  where p.voided = false
  having p_kind = 'payslip';
$$;
