# Multi-currency conversion (admin-managed FX) — Implementation Plan

**Status:** implemented (migration `0056_multi_currency_fx.sql`; `src/lib/finance/fx.ts`, `src/lib/services/finance/fx-*.ts`) · **Date:** 2026-08-06 · **Area:** Finance / Dashboard

> Historical design record — the plan below shipped as described. Kept for the rationale, not as pending work.

## Goal

Let an admin normalise every finance amount (receipts + pay slips) into a single **base currency** using **exchange rates the admin maintains by hand**, so that all academy-wide money figures — the dashboard **Net** card, the **revenue chart**, and the finance totals — read in one currency instead of a per-currency list, and each document can show its base-currency equivalent "at the time it was issued".

This also removes the one inconsistency found in the calculation audit: the revenue chart currently collapses to a single "primary" currency (`rev − pay`) while the Net card nets per-currency. Once every doc carries a base-currency amount, both rollups simply sum that column and always agree.

## Decisions (confirmed)

| Question                | Decision                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Base/reporting currency | **Admin-set org setting, default `INR`.**                                                                                         |
| Rate source             | **Admin-managed, effective-dated manual rate table.** No external API, no key, no cost.                                           |
| Conversion timing       | **Snapshot at issue** (rate effective on `issue_date`), **re-derivable** via an admin recompute.                                  |
| First-version scope     | Rate-management page + normalised rollups + **per-document base equivalent**. Per-doc manual override is **out of scope** for v1. |

## Core model

A converted amount is a **reporting projection**, not part of the legal document. The receipt/pay slip still shows its original currency and total (finance docs stay "immutable once issued"); the base-currency figure is a derived field used for internal rollups and an optional "≈ ₹X at issue" line. This keeps immutability intact while allowing an admin to fix a wrong/missing historical rate and recompute.

### 1. Base currency (org settings)

Add `base_currency text not null default 'INR'` to the existing org-settings row (same place `getInstituteTimeZone()` reads). Validated against `SUPPORTED_CURRENCIES` in `@/lib/money`.

### 2. Exchange-rate table (new)

```sql
create table exchange_rates (
  id             uuid primary key default gen_random_uuid(),
  currency       text not null,                         -- FROM currency, e.g. 'USD'
  base_currency  text not null,                         -- TO currency at entry, e.g. 'INR'
  rate           numeric(18,8) not null check (rate > 0),-- 1 `currency` = `rate` `base_currency`
  effective_from date not null,                          -- applies to issue_date >= effective_from
  note           text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  unique (currency, base_currency, effective_from)
);
create index exchange_rates_lookup_idx
  on exchange_rates (base_currency, currency, effective_from desc);
```

**Rate resolution** for a doc with currency `C`, base `B`, date `D`:

- if `C == B` → rate `1`;
- else the row with `currency=C, base_currency=B, effective_from <= D`, newest `effective_from` (`order by effective_from desc limit 1`);
- if none → **no rate** → the doc is left _unconverted_ (see edge cases).

**RLS:** `SECURITY INVOKER` reads gated to admins (write via `is_active_admin()`), consistent with the finance tables. Rates are academy-wide, not per-user.

**Each amount varies by its own date — worked example.** The rate is resolved _per document_ against _its_ `issue_date`, so identical amounts on different dates convert differently. Base = INR, and the admin has entered: `USD→INR 82.00 from 2026-01-01`, `USD→INR 88.50 from 2026-06-01`.

| Doc    | Amount | issue_date | Rate used        | base_total (INR) |
| ------ | ------ | ---------- | ---------------- | ---------------- |
| R-0007 | $100   | 2026-03-15 | 82.00 (Jan rate) | ₹8,200.00        |
| R-0021 | $100   | 2026-07-02 | 88.50 (Jun rate) | ₹8,850.00        |

Same $100, different INR — exactly the "based on time **and** value" behaviour. Adding a _new_ effective-dated rate only affects docs on/after its `effective_from`; earlier docs keep the historical rate.

**Granularity: date, not intraday.** The anchor is the doc's `issue_date` (a `date`), and published FX plus hand-maintained rates realistically operate at day granularity, so `effective_from` is a `date`. This is deliberate:

- a doc's legal date is a calendar date, not a timestamp — there is no wall-clock "time of the amount" to price against;
- manually maintaining time-of-day rates for a tiny academy is impractical and would invite gaps.
- If intraday precision is ever genuinely needed, the only changes are `effective_from → timestamptz` and resolving against `receipts.created_at` (which _is_ a timestamp) instead of `issue_date`; the rest of the design is unchanged. Recommended: **stay at date granularity** unless a concrete need appears.

### 3. Converted amount on finance docs (new columns)

```sql
alter table receipts
  add column base_currency text,
  add column base_total    numeric(12,2),
  add column fx_rate       numeric(18,8),
  add column fx_rate_id    uuid references exchange_rates(id);
-- identical columns on payslips
```

- `base_total = round(total * fx_rate, currencyDecimals(base_currency))` via the existing `roundTo` in `@/lib/money`.
- `fx_rate` + `fx_rate_id` are stored for audit/provenance.
- Columns are **nullable**: a doc issued when no rate exists stays unconverted until the admin adds the rate and recomputes.

### 4. Conversion at issue

In `src/lib/finance/issue.ts`, after the doc's `total` is computed:

1. read `base_currency` from org settings;
2. resolve the rate for `(currency, base_currency, issue_date)`;
3. set `base_currency`, `base_total`, `fx_rate`, `fx_rate_id` (or leave null if no rate).

Done inside the same transaction that inserts the doc — no second round-trip, and a missing rate never blocks issuance (it just defers conversion).

### 5. Recompute (admin action, re-derivable)

A `SECURITY DEFINER` function `recompute_fx_conversions()` that, for every non-void doc, re-resolves the rate for its `issue_date` against the **current** base currency and rate table, and updates `base_total`/`fx_rate`/`fx_rate_id`. Used when:

- the admin adds a missing historical rate;
- the admin corrects a wrong rate;
- the base currency itself changes (all docs re-normalise to the new base).

Every recompute writes an audit entry (`fx.recompute`) with counts (converted / still-unconverted). It never touches `subtotal`/`discount`/`total`/lines.

### 6. Rollups → base currency

- **`finance_totals` (SQL):** add a sibling `finance_totals_base(p_kind)` returning `sum(base_total)` grouped by `base_currency` over non-void docs **where `base_total is not null`**, plus a separate `unconverted_count`.
- **Net card** (`netMoneyTotals` / `dashboard.ts`): net the base totals → single-currency net. Keep the per-currency breakdown available in the card's detail.
- **Revenue chart** (`dashboard-charts.ts:80-93`): drop the "primary currency" pick; build `Revenue / Payout / Net` from base totals. The `Net` bar (already negative-aware after the chart fix) now reflects the true academy-wide net.
- **Unconverted notice (honest reporting, no silent truncation):** wherever a base rollup is shown, if `unconverted_count > 0`, render "N documents not yet converted (missing rate for <currency> on <date>)" with a link to the rates page. Totals must never silently understate.

### 7. Per-document base equivalent

On the receipt/pay slip detail (and finance list), show `≈ {formatMoney(base_total, base_currency)}` next to the original amount when `base_total` is present and `currency != base_currency`. The PDF keeps showing the original currency as the legal amount; the base line is clearly an approximation ("≈ … at issue").

### 8. Admin rate-management page

`/admin/finance/rates` (a tab under Finance):

- table of rates grouped by currency, effective-dated, with add/edit/delete;
- a "currencies in use without a rate" section derived from issued docs, so the admin knows exactly what to fill;
- a **Recompute conversions** button (calls `recompute_fx_conversions`), showing the converted / still-unconverted counts afterwards;
- base-currency selector (org setting) with a clear warning that changing it triggers a full recompute.

## Edge cases

| Case                          | Handling                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `currency == base_currency`   | rate `1`, `base_total = total`, no rate row needed.                                                                                     |
| No rate for the doc's date    | `base_total` null → excluded from base rollups → counted in the unconverted notice.                                                     |
| Multiple rates for a currency | newest `effective_from <= issue_date` wins (historical accuracy).                                                                       |
| Base currency changed         | recompute re-normalises every doc; any currency lacking a rate to the new base becomes unconverted (flagged).                           |
| Rounding                      | `round(total * rate, currencyDecimals(base))` — reuse `@/lib/money` `roundTo`; base decimals follow the currency (INR 2, KWD 3, JPY 0). |
| Voided docs                   | excluded from all totals, same as today.                                                                                                |
| Rate ≤ 0                      | rejected by DB check + Zod validator.                                                                                                   |

## Immutability note

Finance docs remain immutable in their **legal content** (currency, subtotal, discount, total, lines). `base_total`/`fx_*` are explicitly a **reporting overlay** that an admin may recompute; this is documented on the model and surfaced as "≈ … at issue" so it is never mistaken for the invoiced amount.

## Phased tasks (TDD)

**Phase 1 — Data + conversion core**

1. Migration: `base_currency` on org settings; `exchange_rates` table + RLS; `base_*` columns on receipts/payslips; `finance_totals_base` + `recompute_fx_conversions`. Delivered as a `.sql` in `C:\Users\Shamil\Documents` (per project convention) and mirrored into `supabase/migrations/`.
2. `src/lib/money.ts` (or `src/lib/finance/fx.ts`): `resolveRate(rates, currency, base, date)` + `convertToBase(total, rate, base)` — pure, unit-tested first.
3. Data layer: `selectExchangeRates`, `upsertExchangeRate`, `deleteExchangeRate`, `currenciesInUseWithoutRate`.

**Phase 2 — Issue-time snapshot + recompute** 4. Wire conversion into `src/lib/finance/issue.ts` (in-transaction). 5. `recompute_fx_conversions` service wrapper + `fx.recompute` audit.

**Phase 3 — Rollups** 6. `finance_totals_base` service + switch Net card and revenue chart to base totals. 7. Unconverted-count notice component on the finance/dashboard rollups.

**Phase 4 — Admin UI** 8. `/admin/finance/rates` page: rate CRUD, missing-rate list, recompute button, base-currency setting. 9. Per-document "≈ base" line on receipt/pay slip detail + finance list.

**Phase 5 — Verify** 10. Unit: rate resolution (effective-dated, missing, equal-currency), conversion rounding per currency, base net, recompute counts. 11. Integration: issue-with-conversion, add-rate-then-recompute, base-currency change. 12. E2E (mock): admin adds a rate, dashboard Net/chart render in base, unconverted notice appears/clears.

## Out of scope (v1)

- Per-document manual rate override.
- Automatic rate fetching from any external/live FX API.
- Historical FX charting or gain/loss reporting.

## Risks

- **Base-currency change is heavy** (full recompute) — gate behind a confirm + audit.
- **Manual rates can be stale** — the "currencies in use without a rate" list and the unconverted notice make gaps visible rather than silent.
- **Immutability perception** — mitigated by treating base amounts as a labelled reporting overlay, never as the invoiced figure.
