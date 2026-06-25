# Phase 4 — Finance (Receipts & Pay Slips) Implementation Plan

> **How to build this (no special model, plugin, or skill required).** This plan is fully self-contained. Build the tasks **in order**, top to bottom. For each task, follow the steps verbatim: write the test exactly as shown → run the exact command and confirm the expected FAIL → paste the implementation exactly as shown → re-run and confirm PASS → commit. Then check off each `- [ ]`. Do not reorder steps, skip the test-first order, or improvise — every command and code block is provided literally.

**Goal:** Admin issues a numbered, branded **receipt** (for a student) or **pay slip** (for a teacher) as an HTML→PDF stored in the institute's Google Drive; the student/teacher can download their own; corrections are handled by **void + reissue** (the number is preserved on the voided doc; the corrected doc gets a fresh number); admin can export finance rows as CSV. Numbering is concurrency-safe (sequential, no duplicates). Documents are immutable once issued.

**Architecture:** Builds on the Phase 0 spine (profiles, `org_settings`, `is_active_admin`, `current_status`, `lib/repos/orgSettings` with `getOrgSettings()` + `receiptNumber()`, `lib/drive/{auth,folders}`) and Phase 1 (`audit_log` + `lib/audit` `writeAudit`). Postgres + RLS is the security boundary (new `receipts`, `receipt_lines`, `payslips`, `payslip_lines`, `document_counters` tables + a `SECURITY DEFINER` `next_document_number(doc_type, year)` function for transactional numbering). Admin mutations use the service-role client (`createAdminClient`); student/teacher own-document reads use the RLS-enforced server client (`createClient`). Route Handlers under `app/api/{receipts,payslips}/*` and admin pages under `app/(app)/admin/{finance,settings}` are the backend-for-frontend, all guarded by `getProfile()` + `assertRole()`. PDFs are generated server-side via headless Chromium (`puppeteer-core` + `@sparticuz/chromium`) from the **Option B · Modern Minimal** template (ported from `receipt/Receipt Templates.dc.html`) with the brand fonts (Louis George Cafe + Dagger Square) base64-embedded and the `logo_h.png` logo. Responses use the `{ success, data?, error? }` envelope.

**Tech Stack:** Next.js 14, TypeScript, Tailwind 4, `@supabase/supabase-js`, `@supabase/ssr`, `googleapis`, Zod, **`puppeteer-core` + `@sparticuz/chromium`** (new this phase), Vitest, Playwright.

**Prereqted spec:** `docs/superpowers/specs/2026-06-25-cert-ed-academia-app-design.md` (§3 PDF row, §4.5 PDF generation, §5 finance tables, §7.5 finance detail — paid/due + due-date OMITTED; subtotal/discount optional; total = subtotal − discount).

---

## File map (created in this phase)

```
supabase/migrations/0005_finance.sql                 # receipts/receipt_lines/payslips/payslip_lines/document_counters + next_document_number() + RLS
lib/money.ts                                          # formatMoney / lineAmount / computeTotals (TDD)
lib/repos/documentCounters.ts                         # allocateNumber(docType, year) via RPC (TDD)
lib/repos/receipts.ts                                 # createReceipt / getReceipt / listReceipts / voidReceipt / lastRateFor (TDD)
lib/repos/payslips.ts                                 # createPayslip / getPayslip / listPayslips / voidPayslip / lastRateFor (TDD)
lib/validation/receipt.ts                             # Zod issue-receipt schema (TDD)
lib/validation/payslip.ts                             # Zod issue-payslip schema (TDD)
lib/pdf/brandAssets.ts                                # base64 font + logo loader (cached)
lib/pdf/receiptTemplate.ts                            # Option B HTML for a receipt (TDD)
lib/pdf/payslipTemplate.ts                            # Option B HTML for a pay slip (TDD)
lib/pdf/renderPdf.ts                                  # htmlToPdf(html): Promise<Buffer> via chromium (smoke)
lib/finance/issueReceipt.ts                           # orchestration: totals→number→pdf→drive→insert→audit (TDD, mocked)
lib/finance/issuePayslip.ts                           # orchestration for pay slips (TDD, mocked)
lib/finance/csv.ts                                    # toCsv(rows) (TDD)
app/api/receipts/route.ts                             # GET (own/admin) + POST (admin issue)
app/api/receipts/[id]/pdf/route.ts                    # access-checked download (own or admin)
app/api/receipts/[id]/void/route.ts                   # admin void
app/api/receipts/export/route.ts                      # admin CSV export
app/api/payslips/route.ts                             # GET + POST
app/api/payslips/[id]/pdf/route.ts                    # access-checked download
app/api/payslips/[id]/void/route.ts                   # admin void
app/api/payslips/export/route.ts                      # admin CSV export
app/(app)/admin/finance/page.tsx                      # issue receipt / pay slip + list + void
app/(app)/admin/finance/IssueReceiptForm.tsx          # itemized lines, last-rate prefill, live total
app/(app)/admin/finance/IssuePayslipForm.tsx          # itemized lines, last-rate prefill, live total
app/(app)/admin/settings/page.tsx                     # org_settings editor
app/(app)/admin/settings/actions.ts                   # server action to update org_settings (admin)
app/(app)/receipts/page.tsx                           # student: own receipts + download
app/(app)/payslips/page.tsx                           # teacher: own pay slips + download
e2e/finance.spec.ts                                   # admin issues → student downloads → void → reissue
```

---

## Task 4.1: Migration — finance tables + numbering function + RLS

**Files:**
- Create: `supabase/migrations/0005_finance.sql`
- Test: `tests/integration/rls-finance.test.ts`

- [ ] **Step 1: Write the failing RLS integration test**

```ts
// tests/integration/rls-finance.test.ts
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(url, service) // bypasses RLS — used to seed + sanity reads

const ids = {
  student: '00000000-0000-0000-0000-0000000a0101',
  teacher: '00000000-0000-0000-0000-0000000a0102',
  receipt: '00000000-0000-0000-0000-0000000e0101',
  payslip: '00000000-0000-0000-0000-0000000f0101',
}

beforeAll(async () => {
  await admin.from('profiles').upsert([
    { id: ids.student, email: 'fin-stud@seed.test', role: 'student', status: 'active', class_level: '5' },
    { id: ids.teacher, email: 'fin-teach@seed.test', role: 'teacher', status: 'active' },
  ], { onConflict: 'id' })
  await admin.from('receipts').upsert({
    id: ids.receipt, number: 'CEA-R-2099-9001', student_id: ids.student,
    student_name_snapshot: 'Seed Student', class_snapshot: '5', issue_date: '2099-01-01',
    currency: 'INR', subtotal: 1000, discount: null, total: 1000,
    drive_file_id: 'd-r-1', drive_link: 'http://d/r1', created_by: ids.student,
  }, { onConflict: 'id' })
  await admin.from('receipt_lines').upsert({
    receipt_id: ids.receipt, subject: 'Maths', hours: 5, rate: 200, amount: 1000,
  })
  await admin.from('payslips').upsert({
    id: ids.payslip, number: 'CEA-P-2099-9001', teacher_id: ids.teacher,
    teacher_name_snapshot: 'Seed Teacher', issue_date: '2099-01-01',
    currency: 'INR', total: 2000, drive_file_id: 'd-p-1', drive_link: 'http://d/p1', created_by: ids.teacher,
  }, { onConflict: 'id' })
  await admin.from('payslip_lines').upsert({
    payslip_id: ids.payslip, label: 'Maths · Class 5', hours: 10, rate: 200, amount: 2000,
  })
})

afterAll(async () => {
  await admin.from('receipt_lines').delete().eq('receipt_id', ids.receipt)
  await admin.from('receipts').delete().eq('id', ids.receipt)
  await admin.from('payslip_lines').delete().eq('payslip_id', ids.payslip)
  await admin.from('payslips').delete().eq('id', ids.payslip)
  await admin.from('profiles').delete().in('id', [ids.student, ids.teacher])
})

describe('receipts RLS', () => {
  it('anon cannot read receipts', async () => {
    const c = createClient(url, anon)
    const { data, error } = await c.from('receipts').select('*')
    expect(error ?? (data?.length ?? 0) === 0).toBeTruthy()
  })
  it('service role sees the seeded receipt (sanity: columns exist)', async () => {
    const { data, error } = await admin.from('receipts').select('subtotal,discount,total').eq('id', ids.receipt).single()
    expect(error).toBeNull()
    expect(data?.total).toBe(1000)
    expect(data?.discount).toBeNull() // discount nullable
  })
  it('receipts table has NO paid/due/due_date columns (spec: omitted)', async () => {
    const { error } = await admin.from('receipts').select('due_date').eq('id', ids.receipt)
    expect(error).not.toBeNull() // column does not exist
  })
})

describe('payslips RLS', () => {
  it('anon cannot read payslips', async () => {
    const c = createClient(url, anon)
    const { data, error } = await c.from('payslips').select('*')
    expect(error ?? (data?.length ?? 0) === 0).toBeTruthy()
  })
  it('service role sees the seeded payslip (sanity)', async () => {
    const { data, error } = await admin.from('payslips').select('total').eq('id', ids.payslip).single()
    expect(error).toBeNull()
    expect(data?.total).toBe(2000)
  })
})

describe('next_document_number()', () => {
  it('returns strictly increasing sequential ints for a (type,year)', async () => {
    // run twice for an isolated test year; gaps acceptable, duplicates not
    const a = await admin.rpc('next_document_number', { p_doc_type: 'receipt', p_year: 2098 })
    const b = await admin.rpc('next_document_number', { p_doc_type: 'receipt', p_year: 2098 })
    expect(a.error).toBeNull(); expect(b.error).toBeNull()
    expect(Number(b.data)).toBe(Number(a.data) + 1)
  })
})
```

> Full per-role JWT RLS assertions (student sees only own receipt; teacher only own pay slip) are exercised in the API integration tests (Task 4.6/4.8) where a real session exists. This file proves the **tables + numbering function exist**, anon is blocked, the spec column set is correct (subtotal/discount/total present; paid/due/due_date absent), and the counter is monotonic.

- [ ] **Step 2: Run it — must fail (tables missing)**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-finance.test.ts`
Expected: FAIL — relation "receipts" does not exist.

- [ ] **Step 3: Write the migration** — `supabase/migrations/0005_finance.sql`

```sql
-- supabase/migrations/0005_finance.sql
-- Phase 4: finance — receipts + pay slips (spec §5, §5.1, §7.5).
-- Assumes Phase 0 (profiles, is_active_admin, current_status, org_settings) and
-- Phase 1 (audit_log) exist. Documents are immutable once issued; corrections via void+reissue.
-- NOTE: receipts intentionally have NO paid/due status and NO due_date (spec §3/§7.5: omitted).

create type doc_type as enum ('receipt', 'payslip');

-- ── document_counters: (doc_type, year) -> last_number ────────────────
-- One row per (type, year); bumped atomically inside the issuing transaction.
create table document_counters (
  doc_type doc_type not null,
  year integer not null,
  last_number integer not null default 0,
  primary key (doc_type, year)
);

-- Atomic, concurrency-safe sequential allocation. SECURITY DEFINER so it runs with
-- table-owner rights regardless of caller RLS; the UPSERT + RETURNING is a single
-- statement so concurrent callers serialize on the PK row lock (gaps ok, dupes never).
create or replace function next_document_number(p_doc_type doc_type, p_year integer)
returns integer
language sql security definer set search_path = public as $$
  insert into document_counters (doc_type, year, last_number)
  values (p_doc_type, p_year, 1)
  on conflict (doc_type, year)
    do update set last_number = document_counters.last_number + 1
  returning last_number;
$$;

-- ── receipts ──────────────────────────────────────────────────────────
create table receipts (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,                       -- e.g. CEA-R-2026-0001
  student_id uuid not null references profiles(id) on delete restrict,
  student_name_snapshot text not null,               -- snapshot at issue time
  class_snapshot text,
  issue_date date not null default current_date,
  currency text not null default 'INR',
  note text,
  subtotal numeric(12,2) not null,                   -- sum of line amounts
  discount numeric(12,2),                             -- nullable; only when applied
  total numeric(12,2) not null,                      -- = subtotal - coalesce(discount,0)
  drive_file_id text not null,
  drive_link text not null,
  voided boolean not null default false,             -- void keeps the number; reissue gets a new one
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index receipts_student_idx on receipts (student_id);

create table receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  subject text not null,
  hours numeric(8,2) not null,
  rate numeric(12,2) not null,
  amount numeric(12,2) not null,                     -- = hours * rate
  created_at timestamptz not null default now()
);
create index receipt_lines_receipt_idx on receipt_lines (receipt_id);

-- ── payslips ──────────────────────────────────────────────────────────
create table payslips (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,                       -- e.g. CEA-P-2026-0001
  teacher_id uuid not null references profiles(id) on delete restrict,
  teacher_name_snapshot text not null,
  issue_date date not null default current_date,
  currency text not null default 'INR',
  note text,
  total numeric(12,2) not null,                      -- net total (sum of line amounts)
  drive_file_id text not null,
  drive_link text not null,
  voided boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index payslips_teacher_idx on payslips (teacher_id);

create table payslip_lines (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references payslips(id) on delete cascade,
  label text not null,                               -- subject / class
  hours numeric(8,2) not null,
  rate numeric(12,2) not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create index payslip_lines_payslip_idx on payslip_lines (payslip_id);

alter table receipts          enable row level security;
alter table receipt_lines     enable row level security;
alter table payslips          enable row level security;
alter table payslip_lines     enable row level security;
alter table document_counters enable row level security;

-- ── receipts policies (spec §5.1: students read own; admin all; admin-only write) ──
create policy receipts_read on receipts for select
  using (student_id = auth.uid() or is_active_admin());
create policy receipts_admin_write on receipts for all
  using (is_active_admin()) with check (is_active_admin());

create policy receipt_lines_read on receipt_lines for select
  using (
    is_active_admin()
    or exists (select 1 from receipts r where r.id = receipt_lines.receipt_id and r.student_id = auth.uid())
  );
create policy receipt_lines_admin_write on receipt_lines for all
  using (is_active_admin()) with check (is_active_admin());

-- ── payslips policies (teachers read own; admin all; admin-only write) ──
create policy payslips_read on payslips for select
  using (teacher_id = auth.uid() or is_active_admin());
create policy payslips_admin_write on payslips for all
  using (is_active_admin()) with check (is_active_admin());

create policy payslip_lines_read on payslip_lines for select
  using (
    is_active_admin()
    or exists (select 1 from payslips p where p.id = payslip_lines.payslip_id and p.teacher_id = auth.uid())
  );
create policy payslip_lines_admin_write on payslip_lines for all
  using (is_active_admin()) with check (is_active_admin());

-- ── document_counters: admin-only (server uses service role anyway; RPC is SECURITY DEFINER) ──
create policy counters_admin_all on document_counters for all
  using (is_active_admin()) with check (is_active_admin());
```

- [ ] **Step 4: Apply the migration**

Run (Supabase CLI linked to `cert-ed-prod`): `supabase db push`
(or paste the SQL into the Supabase SQL editor for the prod project.)
Expected: success; the five tables created with RLS enabled and `next_document_number` available.

- [ ] **Step 5: Run the RLS test — must pass**

Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/rls-finance.test.ts`
Expected: PASS — anon blocked on receipts + payslips; service-role sanity reads succeed; `due_date` column absent; `next_document_number` returns strictly increasing ints.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0005_finance.sql tests/integration/rls-finance.test.ts
git commit -m "feat: finance schema (receipts/payslips/lines/counters) + numbering fn + RLS"
```

---

## Task 4.2: `lib/money.ts` — formatting + totals (TDD)

> Spec §5/§7.5: line `amount = hours * rate`; `subtotal = Σ amount`; `total = subtotal − discount` (discount optional); currency formatting via `Intl.NumberFormat` (INR + GCC currencies).

**Files:**
- Create: `lib/money.ts`
- Test: `tests/unit/money.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/money.test.ts
import { describe, it, expect } from 'vitest'
import { formatMoney, lineAmount, computeTotals } from '@/lib/money'

describe('formatMoney', () => {
  it('formats INR with the rupee symbol and Indian grouping', () => {
    const out = formatMoney(123456.5, 'INR')
    expect(out).toContain('₹')
    expect(out).toMatch(/1,23,456/) // en-IN grouping
  })
  it('formats a GCC currency (AED) with its code/symbol', () => {
    const out = formatMoney(1500, 'AED')
    expect(out).toMatch(/AED|د\.إ/)
    expect(out).toMatch(/1,500/)
  })
  it('always shows two fraction digits', () => {
    expect(formatMoney(1000, 'INR')).toMatch(/1,000\.00/)
  })
  it('throws on an unknown currency code', () => {
    expect(() => formatMoney(10, 'XXXX')).toThrow('invalid currency')
  })
})

describe('lineAmount', () => {
  it('multiplies hours by rate, rounded to 2 dp', () => {
    expect(lineAmount(7.5, 200)).toBe(1500)
    expect(lineAmount(6, 200)).toBe(1200)
  })
  it('rounds half away from zero to 2 dp', () => {
    expect(lineAmount(1.005, 100)).toBe(100.5) // 100.5 exactly
    expect(lineAmount(0.333, 100)).toBe(33.3)
  })
  it('throws on negative inputs', () => {
    expect(() => lineAmount(-1, 100)).toThrow('invalid')
    expect(() => lineAmount(1, -100)).toThrow('invalid')
  })
})

describe('computeTotals', () => {
  const lines = [
    { hours: 7.5, rate: 200 }, // 1500
    { hours: 6, rate: 200 },   // 1200
    { hours: 4, rate: 200 },   // 800
  ]
  it('sums line amounts into subtotal and total when no discount', () => {
    expect(computeTotals(lines)).toEqual({ subtotal: 3500, total: 3500 })
  })
  it('subtracts a discount: total = subtotal - discount', () => {
    expect(computeTotals(lines, 200)).toEqual({ subtotal: 3500, total: 3300 })
  })
  it('treats 0 discount the same as none (total === subtotal)', () => {
    expect(computeTotals(lines, 0)).toEqual({ subtotal: 3500, total: 3500 })
  })
  it('throws when discount exceeds subtotal', () => {
    expect(() => computeTotals(lines, 9999)).toThrow('discount exceeds subtotal')
  })
  it('throws on an empty line list', () => {
    expect(() => computeTotals([])).toThrow('no lines')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/money.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/money.ts`

```ts
/** Round to 2 decimal places, half away from zero (avoids 1.005 -> 1.00 binary drift). */
function round2(n: number): number {
  return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100
}

/** Format a money amount in the given ISO-4217 currency via Intl.NumberFormat. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    throw new Error(`invalid currency: ${currency}`)
  }
}

/** Line amount = hours * rate, rounded to 2 dp. Both inputs must be >= 0. */
export function lineAmount(hours: number, rate: number): number {
  if (!(hours >= 0) || !(rate >= 0)) throw new Error('invalid hours/rate')
  return round2(hours * rate)
}

export type TotalsLine = { hours: number; rate: number }
export type Totals = { subtotal: number; total: number }

/**
 * Sum line amounts into `subtotal`; `total = subtotal - discount` (discount optional).
 * A 0 / undefined discount yields total === subtotal. Discount may not exceed subtotal.
 */
export function computeTotals(lines: TotalsLine[], discount?: number | null): Totals {
  if (!lines || lines.length === 0) throw new Error('no lines')
  const subtotal = round2(lines.reduce((s, l) => s + lineAmount(l.hours, l.rate), 0))
  const d = discount ?? 0
  if (d < 0) throw new Error('invalid discount')
  if (d > subtotal) throw new Error('discount exceeds subtotal')
  return { subtotal, total: round2(subtotal - d) }
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/money.test.ts` — Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/money.ts tests/unit/money.test.ts
git commit -m "feat: money formatting + line/total computation (INR + GCC)"
```

---

## Task 4.3: `lib/repos/documentCounters.ts` — sequential allocator (TDD)

> Spec §5/§8: numbering is concurrency-safe (gaps acceptable, duplicates not). The transactional bump lives in the SQL `next_document_number(doc_type, year)` function (Task 4.1); this repo calls it via RPC and formats the result with `receiptNumber` from Phase 0.

**Files:**
- Create: `lib/repos/documentCounters.ts`
- Test: `tests/integration/documentCounters.test.ts`

- [ ] **Step 1: Write the failing integration test** (real RPC against the DB — proves uniqueness under sequential + concurrent calls)

```ts
// tests/integration/documentCounters.test.ts
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(url, service)

// Use a far-future, dedicated test year to avoid colliding with real data.
const YEAR = 3001

beforeAll(async () => {
  await admin.from('document_counters').delete().eq('year', YEAR)
})
afterAll(async () => {
  await admin.from('document_counters').delete().eq('year', YEAR)
})

import { allocateNumber } from '@/lib/repos/documentCounters'

describe('allocateNumber', () => {
  it('formats prefix-year-padded and increments sequentially', async () => {
    const a = await allocateNumber('receipt', YEAR, 'CEA-R', admin)
    const b = await allocateNumber('receipt', YEAR, 'CEA-R', admin)
    expect(a).toBe('CEA-R-3001-0001')
    expect(b).toBe('CEA-R-3001-0002')
  })

  it('never produces duplicates across many concurrent calls', async () => {
    const N = 25
    const results = await Promise.all(
      Array.from({ length: N }, () => allocateNumber('payslip', YEAR, 'CEA-P', admin)),
    )
    const unique = new Set(results)
    expect(unique.size).toBe(N) // no duplicates under concurrency
    // they are a contiguous 1..N block of CEA-P numbers (order may interleave)
    const nums = results.map((r) => Number(r.slice(-4))).sort((x, y) => x - y)
    expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1))
  })

  it('keeps separate sequences per doc_type', async () => {
    // receipt sequence already at 2 from the first test; payslip at N from the second.
    const r = await allocateNumber('receipt', YEAR, 'CEA-R', admin)
    expect(r).toBe('CEA-R-3001-0003')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/documentCounters.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/repos/documentCounters.ts`

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { receiptNumber } from '@/lib/repos/orgSettings'

export type DocType = 'receipt' | 'payslip'

/**
 * Allocate the next sequential document number for (docType, year) and return it
 * formatted as `<prefix>-<year>-<padded>`. The bump is atomic in the DB
 * (`next_document_number` UPSERT+RETURNING), so concurrent callers never duplicate.
 * A client may be injected for tests; defaults to the service-role admin client.
 */
export async function allocateNumber(
  docType: DocType,
  year: number,
  prefix: string,
  client?: SupabaseClient,
): Promise<string> {
  const sb = client ?? createAdminClient()
  const { data, error } = await sb.rpc('next_document_number', {
    p_doc_type: docType,
    p_year: year,
  })
  if (error) throw new Error(`allocateNumber: ${error.message}`)
  const n = Number(data)
  if (!Number.isInteger(n) || n < 1) throw new Error(`allocateNumber: bad counter value ${data}`)
  return receiptNumber(prefix, year, n)
}
```

> `receiptNumber(prefix, year, n)` (Phase 0, `lib/repos/orgSettings.ts`) formats `CEA-R-2026-0007`. It is reused verbatim for both receipts and pay slips — only the prefix differs (`receipt_prefix` / `payslip_prefix` from `org_settings`).

- [ ] **Step 4: Run — must pass** — Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/documentCounters.test.ts` — Expected: PASS (sequential `0001`/`0002`; 25 concurrent calls yield 25 unique contiguous numbers; per-type sequences independent).

- [ ] **Step 5: Commit**

```bash
git add lib/repos/documentCounters.ts tests/integration/documentCounters.test.ts
git commit -m "feat: concurrency-safe document number allocator (RPC)"
```

---

## Task 4.4: PDF engine — brand assets, Option B templates, html→PDF

> Spec §4.5/§7.5: reuse the **Option B · Modern Minimal** template from `receipt/Receipt Templates.dc.html`, brand fonts Louis George Cafe + Dagger Square, `logo_h.png`. **OMIT** paid/due badges and the **Due** date row. Render **Subtotal / Discount** only when a discount is present (Discount line conditional). Receipts and pay slips are siblings sharing header/footer; all static content (org name, contact, bank, terms, signatory) comes from `org_settings`, never hardcoded. Install `puppeteer-core` + `@sparticuz/chromium`.

**Files:**
- Modify: `package.json`
- Create: `lib/pdf/brandAssets.ts`, `lib/pdf/receiptTemplate.ts`, `lib/pdf/payslipTemplate.ts`, `lib/pdf/renderPdf.ts`
- Test: `tests/unit/receiptTemplate.test.ts`, `tests/unit/payslipTemplate.test.ts`, `tests/unit/renderPdf.smoke.test.ts`

- [ ] **Step 1: Install the PDF dependencies**

Run:
```bash
npm install puppeteer-core @sparticuz/chromium
```
Expected: both added to `dependencies`.

- [ ] **Step 2: Write the failing template tests** (assert the data-driven fields/lines/total + the OMIT/conditional rules appear in the HTML string)

```ts
// tests/unit/receiptTemplate.test.ts
import { describe, it, expect, vi } from 'vitest'

// brandAssets reads files from disk; stub it so the template test is pure + fast.
vi.mock('@/lib/pdf/brandAssets', () => ({
  brandAssets: () => ({ daggerSquareB64: 'AAAA', louisGeorgeB64: 'BBBB', logoB64: 'CCCC' }),
}))

import { renderReceiptHtml } from '@/lib/pdf/receiptTemplate'
import type { OrgSettings } from '@/lib/repos/orgSettings'

const org: OrgSettings = {
  institute_name: 'Cert-Ed Academia',
  contact_email: 'info@certedacademia.com', contact_phone: '+91 7025 237 833',
  bank_account: '0488053000009258', bank_ifsc: 'SIBL0000488', bank_branch: 'Koorkanchery',
  terms_text: 'Fees once paid are non-refundable.',
  signatory_name: 'Mohamed Shahzad', signatory_title: 'CEO',
  signature_mode: 'text', signature_text: 'Digitally signed',
  default_currency: 'INR', timezone: 'Asia/Kolkata', receipt_prefix: 'CEA-R', payslip_prefix: 'CEA-P',
}

const base = {
  number: 'CEA-R-2026-0147', issueDate: '02 Jun 2026',
  studentName: 'Aadhya', classLabel: '5', currency: 'INR',
  lines: [
    { subject: 'Maths', hours: 7.5, rate: 200, amount: 1500 },
    { subject: 'Science', hours: 6, rate: 200, amount: 1200 },
  ],
  subtotal: 2700, discount: null as number | null, total: 2700,
}

describe('renderReceiptHtml', () => {
  it('embeds the student name, class, number, issue date', () => {
    const html = renderReceiptHtml(base, org)
    expect(html).toContain('Aadhya')
    expect(html).toContain('Class 5')
    expect(html).toContain('CEA-R-2026-0147')
    expect(html).toContain('02 Jun 2026')
  })
  it('renders one row per line as "Subject (n hours)" plus a formatted amount', () => {
    const html = renderReceiptHtml(base, org)
    expect(html).toContain('Maths')
    expect(html).toMatch(/7\.5\s*hours/)
    expect(html).toContain('Science')
    expect(html).toMatch(/1,500/)
  })
  it('shows Subtotal + Total but NOT a Discount row when discount is null', () => {
    const html = renderReceiptHtml(base, org)
    expect(html).toContain('Subtotal')
    expect(html).toContain('TOTAL')
    expect(html).not.toMatch(/>\s*Discount\s*</)
  })
  it('shows the Discount row when a discount is present', () => {
    const html = renderReceiptHtml({ ...base, discount: 200, total: 2500 }, org)
    expect(html).toMatch(/Discount/)
    expect(html).toMatch(/200/)
  })
  it('OMITS paid/due badges and the Due date row (spec)', () => {
    const html = renderReceiptHtml(base, org)
    expect(html).not.toMatch(/>PAID</)
    expect(html).not.toMatch(/>DUE</)
    expect(html).not.toMatch(/>\s*Due\s*</)
  })
  it('pulls bank + signatory + terms from org_settings (not hardcoded)', () => {
    const html = renderReceiptHtml(base, org)
    expect(html).toContain('0488053000009258')
    expect(html).toContain('SIBL0000488')
    expect(html).toContain('Mohamed Shahzad')
    expect(html).toContain('CEO')
    expect(html).toContain('Fees once paid are non-refundable.')
    expect(html).toContain('Digitally signed by')
  })
  it('embeds the brand fonts + logo as base64 data (no external URLs)', () => {
    const html = renderReceiptHtml(base, org)
    expect(html).toContain('Dagger Square')
    expect(html).toContain('Louis George Cafe')
    expect(html).toContain('data:image/png;base64,CCCC')
    expect(html).toContain('base64,AAAA')
    expect(html).toContain('base64,BBBB')
    expect(html).not.toMatch(/\.\.\/public\//)
  })
})
```

```ts
// tests/unit/payslipTemplate.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/pdf/brandAssets', () => ({
  brandAssets: () => ({ daggerSquareB64: 'AAAA', louisGeorgeB64: 'BBBB', logoB64: 'CCCC' }),
}))

import { renderPayslipHtml } from '@/lib/pdf/payslipTemplate'
import type { OrgSettings } from '@/lib/repos/orgSettings'

const org: OrgSettings = {
  institute_name: 'Cert-Ed Academia',
  contact_email: 'info@certedacademia.com', contact_phone: '+91 7025 237 833',
  bank_account: '0488053000009258', bank_ifsc: 'SIBL0000488', bank_branch: 'Koorkanchery',
  terms_text: 'Pay slip issued for services rendered.',
  signatory_name: 'Mohamed Shahzad', signatory_title: 'CEO',
  signature_mode: 'text', signature_text: 'Digitally signed',
  default_currency: 'INR', timezone: 'Asia/Kolkata', receipt_prefix: 'CEA-R', payslip_prefix: 'CEA-P',
}

const data = {
  number: 'CEA-P-2026-0007', issueDate: '02 Jun 2026', teacherName: 'Priya Nair', currency: 'INR',
  lines: [
    { label: 'Maths · Class 5', hours: 10, rate: 200, amount: 2000 },
    { label: 'Science · Class 6', hours: 8, rate: 250, amount: 2000 },
  ],
  total: 4000,
}

describe('renderPayslipHtml', () => {
  it('shows the teacher name + number + issue date, and NO student/class block', () => {
    const html = renderPayslipHtml(data, org)
    expect(html).toContain('Priya Nair')
    expect(html).toContain('CEA-P-2026-0007')
    expect(html).toContain('02 Jun 2026')
    expect(html).not.toContain('STUDENT')
    expect(html).not.toMatch(/Class\s+\d/)
  })
  it('renders one row per pay line with its label + amount, and a net Total', () => {
    const html = renderPayslipHtml(data, org)
    expect(html).toContain('Maths · Class 5')
    expect(html).toContain('Science · Class 6')
    expect(html).toContain('TOTAL')
    expect(html).toMatch(/4,000/)
  })
  it('shares the org-driven footer (bank/signatory/terms) and embedded brand assets', () => {
    const html = renderPayslipHtml(data, org)
    expect(html).toContain('0488053000009258')
    expect(html).toContain('Mohamed Shahzad')
    expect(html).toContain('Pay slip issued for services rendered.')
    expect(html).toContain('data:image/png;base64,CCCC')
  })
  it('OMITS paid/due badges and due-date row', () => {
    const html = renderPayslipHtml(data, org)
    expect(html).not.toMatch(/>PAID</)
    expect(html).not.toMatch(/>DUE</)
  })
})
```

- [ ] **Step 3: Run — must fail** — Run: `npm run test -- tests/unit/receiptTemplate.test.ts tests/unit/payslipTemplate.test.ts` — Expected: FAIL (no modules).

- [ ] **Step 4: Implement the brand-asset loader** — `lib/pdf/brandAssets.ts`

```ts
import 'server-only'
import { readFileSync } from 'node:fs'
import path from 'node:path'

type Brand = { daggerSquareB64: string; louisGeorgeB64: string; logoB64: string }

let cached: Brand | null = null

/** Load + base64-encode the brand fonts and logo once (cached for the process lifetime). */
export function brandAssets(): Brand {
  if (cached) return cached
  const root = process.cwd()
  const read = (...p: string[]) => readFileSync(path.join(root, 'public', ...p)).toString('base64')
  cached = {
    daggerSquareB64: read('fonts', 'DAGGERSQUARE.otf'),
    louisGeorgeB64: read('fonts', 'louis-george-cafe.regular.ttf'),
    logoB64: read('lockups', 'logo_h.png'),
  }
  return cached
}
```

- [ ] **Step 5: Implement the receipt template** — `lib/pdf/receiptTemplate.ts`

```ts
import { brandAssets } from '@/lib/pdf/brandAssets'
import { formatMoney } from '@/lib/money'
import type { OrgSettings } from '@/lib/repos/orgSettings'

export type ReceiptLineView = { subject: string; hours: number; rate: number; amount: number }
export type ReceiptView = {
  number: string
  issueDate: string            // pre-formatted display date, e.g. "02 Jun 2026"
  studentName: string
  classLabel: string | null
  currency: string
  lines: ReceiptLineView[]
  subtotal: number
  discount: number | null      // null/0 => no discount row (spec)
  total: number
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Shared <head> with embedded brand fonts + base reset, used by receipt + pay slip. */
function head(): string {
  const { daggerSquareB64, louisGeorgeB64 } = brandAssets()
  return `<head><meta charset="utf-8"><style>
@font-face{font-family:'Dagger Square';src:url('data:font/otf;base64,${daggerSquareB64}') format('opentype');font-weight:400 800;font-style:normal;}
@font-face{font-family:'Louis George Cafe';src:url('data:font/ttf;base64,${louisGeorgeB64}') format('truetype');font-weight:400 700;font-style:normal;}
@page{size:A4;margin:0;}
*{box-sizing:border-box;}
body{margin:0;font-family:'Louis George Cafe',sans-serif;-webkit-font-smoothing:antialiased;color:#1f2937;}
</style></head>`
}

/** Header (logo + contact) + thin top accent — shared, org-driven. */
function header(org: OrgSettings): string {
  const { logoB64 } = brandAssets()
  return `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <img src="data:image/png;base64,${logoB64}" alt="${esc(org.institute_name)}" style="height:42px;width:auto;margin-top:4px;" />
    <div style="display:flex;flex-direction:column;gap:9px;align-items:flex-end;">
      <div style="font-size:13px;color:#475467;font-weight:500;">${esc(org.contact_email ?? '')}</div>
      <div style="font-size:13px;color:#475467;font-weight:500;">${esc(org.contact_phone ?? '')}</div>
    </div>
  </div>
  <div style="height:1px;background:#ECEEF3;margin:30px 0 28px;"></div>`
}

/** Footer (payment details + signatory + terms) — shared, org-driven. */
function footer(org: OrgSettings): string {
  return `
  <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:30px;padding-top:48px;">
    <div style="max-width:300px;">
      <div style="font-size:11px;letter-spacing:1.4px;color:#98a2b3;font-weight:700;">PAYMENT DETAILS</div>
      <div style="margin-top:9px;font-size:13px;line-height:1.9;color:#475467;">Account&nbsp;&nbsp;<span style="color:#1f2937;font-weight:600;">${esc(org.bank_account ?? '')}</span><br>IFSC&nbsp;&nbsp;<span style="color:#1f2937;font-weight:600;">${esc(org.bank_ifsc ?? '')}</span> · ${esc(org.bank_branch ?? '')}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:#98a2b3;font-weight:600;letter-spacing:.5px;">Digitally signed by</div>
      <div style="font-size:16px;font-weight:700;color:#1E2A63;margin-top:6px;">${esc(org.signatory_name ?? '')}</div>
      <div style="font-size:12.5px;color:#98a2b3;margin-top:1px;">${esc(org.signatory_title ?? '')}</div>
    </div>
  </div>
  <div style="margin-top:24px;font-size:11.5px;line-height:1.7;color:#98a2b3;border-top:1px solid #F0F1F5;padding-top:16px;">${esc(org.terms_text ?? '')}</div>`
}

/** Shared totals block. Discount row rendered only when discount > 0 (spec). */
function totals(subtotal: number, discount: number | null, total: number, currency: string): string {
  const discountRow =
    discount && discount > 0
      ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:#667085;"><span>Discount</span><span style="font-weight:600;color:#1F8A5B;">– ${formatMoney(discount, currency)}</span></div>`
      : ''
  return `
  <div style="margin-top:26px;display:flex;justify-content:flex-end;">
    <div style="width:280px;">
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:#667085;"><span>Subtotal</span><span style="font-weight:600;color:#1f2937;">${formatMoney(subtotal, currency)}</span></div>
      ${discountRow}
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:14px;padding-top:14px;border-top:1px solid #ECEEF3;"><span style="font-size:13px;color:#98a2b3;font-weight:600;letter-spacing:.5px;">TOTAL</span><span style="font-size:26px;font-weight:800;color:#1E2A63;">${formatMoney(total, currency)}</span></div>
      <div style="height:3px;background:#4AA7DD;border-radius:2px;margin-top:8px;margin-left:auto;width:120px;"></div>
    </div>
  </div>`
}

/** Build the full Option B receipt HTML string from data + org settings. */
export function renderReceiptHtml(r: ReceiptView, org: OrgSettings): string {
  const rows = r.lines
    .map(
      (l) => `
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:18px 0;border-bottom:1px solid #F0F1F5;">
        <div><span style="font-size:15px;font-weight:600;color:#1f2937;">${esc(l.subject)}</span><span style="font-size:13px;color:#98a2b3;margin-left:10px;">${l.hours} hours</span></div>
        <div style="font-size:15px;font-weight:600;color:#1f2937;">${formatMoney(l.amount, r.currency)}</div>
      </div>`,
    )
    .join('')

  return `<!DOCTYPE html><html>${head()}<body>
  <div style="position:relative;width:100%;min-height:1075px;background:#fff;display:flex;flex-direction:column;border-top:5px solid #1E2A63;">
    <div style="flex:1;display:flex;flex-direction:column;padding:54px 54px 70px;">
      ${header(org)}
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:11px;letter-spacing:1.4px;color:#98a2b3;font-weight:700;">STUDENT</div>
          <div style="font-size:20px;font-weight:700;color:#1E2A63;margin-top:8px;">${esc(r.studentName)}</div>
          <div style="font-size:13.5px;color:#667085;margin-top:3px;">Class ${esc(r.classLabel ?? '—')}</div>
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;gap:11px;align-items:flex-end;">
          <div style="display:flex;gap:10px;font-size:13px;"><span style="color:#98a2b3;">Receipt No</span><span style="font-weight:600;color:#1f2937;min-width:84px;">${esc(r.number)}</span></div>
          <div style="display:flex;gap:10px;font-size:13px;"><span style="color:#98a2b3;">Issued</span><span style="font-weight:600;color:#1f2937;min-width:84px;">${esc(r.issueDate)}</span></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;padding:0 0 12px;border-bottom:2px solid #1E2A63;margin-top:40px;">
        <div style="font-size:11px;letter-spacing:1.4px;color:#1E2A63;font-weight:700;">DESCRIPTION</div>
        <div style="font-size:11px;letter-spacing:1.4px;color:#1E2A63;font-weight:700;">AMOUNT</div>
      </div>
      ${rows}
      ${totals(r.subtotal, r.discount, r.total, r.currency)}
      ${footer(org)}
    </div>
  </div>
  </body></html>`
}
```

> The Option B markup is ported from `receipt/Receipt Templates.dc.html` (lines 107–172), with the design tool's `{{ }}`/`sc-if`/`sc-for` placeholders replaced by interpolation, the **Due** row + **PAID/DUE** badges removed, and the Discount row made conditional. The `head()`/`header()`/`footer()`/`totals()` helpers are shared with the pay slip so the two are true siblings.

- [ ] **Step 6: Implement the pay slip template** — `lib/pdf/payslipTemplate.ts`

```ts
import { brandAssets } from '@/lib/pdf/brandAssets'
import { formatMoney } from '@/lib/money'
import type { OrgSettings } from '@/lib/repos/orgSettings'

export type PayslipLineView = { label: string; hours: number; rate: number; amount: number }
export type PayslipView = {
  number: string
  issueDate: string
  teacherName: string
  currency: string
  lines: PayslipLineView[]
  total: number
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function head(): string {
  const { daggerSquareB64, louisGeorgeB64 } = brandAssets()
  return `<head><meta charset="utf-8"><style>
@font-face{font-family:'Dagger Square';src:url('data:font/otf;base64,${daggerSquareB64}') format('opentype');font-weight:400 800;}
@font-face{font-family:'Louis George Cafe';src:url('data:font/ttf;base64,${louisGeorgeB64}') format('truetype');font-weight:400 700;}
@page{size:A4;margin:0;}
*{box-sizing:border-box;}
body{margin:0;font-family:'Louis George Cafe',sans-serif;-webkit-font-smoothing:antialiased;color:#1f2937;}
</style></head>`
}

function header(org: OrgSettings): string {
  const { logoB64 } = brandAssets()
  return `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <img src="data:image/png;base64,${logoB64}" alt="${esc(org.institute_name)}" style="height:42px;width:auto;margin-top:4px;" />
    <div style="display:flex;flex-direction:column;gap:9px;align-items:flex-end;">
      <div style="font-size:13px;color:#475467;font-weight:500;">${esc(org.contact_email ?? '')}</div>
      <div style="font-size:13px;color:#475467;font-weight:500;">${esc(org.contact_phone ?? '')}</div>
    </div>
  </div>
  <div style="height:1px;background:#ECEEF3;margin:30px 0 28px;"></div>`
}

function footer(org: OrgSettings): string {
  return `
  <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:30px;padding-top:48px;">
    <div style="max-width:300px;">
      <div style="font-size:11px;letter-spacing:1.4px;color:#98a2b3;font-weight:700;">PAYMENT DETAILS</div>
      <div style="margin-top:9px;font-size:13px;line-height:1.9;color:#475467;">Account&nbsp;&nbsp;<span style="color:#1f2937;font-weight:600;">${esc(org.bank_account ?? '')}</span><br>IFSC&nbsp;&nbsp;<span style="color:#1f2937;font-weight:600;">${esc(org.bank_ifsc ?? '')}</span> · ${esc(org.bank_branch ?? '')}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:#98a2b3;font-weight:600;letter-spacing:.5px;">Digitally signed by</div>
      <div style="font-size:16px;font-weight:700;color:#1E2A63;margin-top:6px;">${esc(org.signatory_name ?? '')}</div>
      <div style="font-size:12.5px;color:#98a2b3;margin-top:1px;">${esc(org.signatory_title ?? '')}</div>
    </div>
  </div>
  <div style="margin-top:24px;font-size:11.5px;line-height:1.7;color:#98a2b3;border-top:1px solid #F0F1F5;padding-top:16px;">${esc(org.terms_text ?? '')}</div>`
}

/** Build the full Option B pay slip HTML — sibling of the receipt; no student/class block. */
export function renderPayslipHtml(p: PayslipView, org: OrgSettings): string {
  const rows = p.lines
    .map(
      (l) => `
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:18px 0;border-bottom:1px solid #F0F1F5;">
        <div><span style="font-size:15px;font-weight:600;color:#1f2937;">${esc(l.label)}</span><span style="font-size:13px;color:#98a2b3;margin-left:10px;">${l.hours} hours</span></div>
        <div style="font-size:15px;font-weight:600;color:#1f2937;">${formatMoney(l.amount, p.currency)}</div>
      </div>`,
    )
    .join('')

  return `<!DOCTYPE html><html>${head()}<body>
  <div style="position:relative;width:100%;min-height:1075px;background:#fff;display:flex;flex-direction:column;border-top:5px solid #1E2A63;">
    <div style="flex:1;display:flex;flex-direction:column;padding:54px 54px 70px;">
      ${header(org)}
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:11px;letter-spacing:1.4px;color:#98a2b3;font-weight:700;">PAY SLIP FOR</div>
          <div style="font-size:20px;font-weight:700;color:#1E2A63;margin-top:8px;">${esc(p.teacherName)}</div>
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;gap:11px;align-items:flex-end;">
          <div style="display:flex;gap:10px;font-size:13px;"><span style="color:#98a2b3;">Pay Slip No</span><span style="font-weight:600;color:#1f2937;min-width:84px;">${esc(p.number)}</span></div>
          <div style="display:flex;gap:10px;font-size:13px;"><span style="color:#98a2b3;">Issued</span><span style="font-weight:600;color:#1f2937;min-width:84px;">${esc(p.issueDate)}</span></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;padding:0 0 12px;border-bottom:2px solid #1E2A63;margin-top:40px;">
        <div style="font-size:11px;letter-spacing:1.4px;color:#1E2A63;font-weight:700;">DESCRIPTION</div>
        <div style="font-size:11px;letter-spacing:1.4px;color:#1E2A63;font-weight:700;">AMOUNT</div>
      </div>
      ${rows}
      <div style="margin-top:26px;display:flex;justify-content:flex-end;">
        <div style="width:280px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:14px;border-top:1px solid #ECEEF3;"><span style="font-size:13px;color:#98a2b3;font-weight:600;letter-spacing:.5px;">TOTAL</span><span style="font-size:26px;font-weight:800;color:#1E2A63;">${formatMoney(p.total, p.currency)}</span></div>
          <div style="height:3px;background:#4AA7DD;border-radius:2px;margin-top:8px;margin-left:auto;width:120px;"></div>
        </div>
      </div>
      ${footer(org)}
    </div>
  </div>
  </body></html>`
}
```

- [ ] **Step 7: Run the template tests — must pass** — Run: `npm run test -- tests/unit/receiptTemplate.test.ts tests/unit/payslipTemplate.test.ts` — Expected: PASS (fields/lines/total present; Discount conditional; paid/due/due-date omitted; assets embedded; pay slip has no student/class).

- [ ] **Step 8: Implement the html→PDF renderer** — `lib/pdf/renderPdf.ts`

```ts
import 'server-only'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

/**
 * Render an HTML string to a PDF Buffer using headless Chromium.
 * Works locally and on Vercel: on Vercel it uses the bundled @sparticuz/chromium binary;
 * locally it falls back to a system Chrome via PUPPETEER_EXECUTABLE_PATH if set.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath())
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: true,
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
```

- [ ] **Step 9: Write a thin smoke test for `htmlToPdf`** (real render; produces a non-trivial PDF buffer)

```ts
// tests/unit/renderPdf.smoke.test.ts
import { describe, it, expect } from 'vitest'
import { htmlToPdf } from '@/lib/pdf/renderPdf'

// Smoke only: launches a real headless Chromium (slow), skipped unless RUN_PDF_SMOKE=1.
const run = process.env.RUN_PDF_SMOKE === '1' ? it : it.skip

describe('htmlToPdf (smoke)', () => {
  run('produces a non-empty PDF buffer starting with the %PDF magic header', async () => {
    const buf = await htmlToPdf('<!doctype html><html><body><h1>Hello PDF</h1></body></html>')
    expect(buf.length).toBeGreaterThan(1000)
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  }, 60_000)
})
```

- [ ] **Step 10: Run the smoke test** — Run: `RUN_PDF_SMOKE=1 npm run test -- tests/unit/renderPdf.smoke.test.ts`
(If no bundled Chromium resolves locally, set `PUPPETEER_EXECUTABLE_PATH` to an installed Chrome/Edge, e.g. `C:/Program Files/Google/Chrome/Application/chrome.exe`.)
Expected: PASS — buffer > 1000 bytes, starts with `%PDF-`. (Without `RUN_PDF_SMOKE=1` the test is skipped — acceptable in CI.)

- [ ] **Step 11: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json lib/pdf tests/unit/receiptTemplate.test.ts tests/unit/payslipTemplate.test.ts tests/unit/renderPdf.smoke.test.ts
git commit -m "feat: option-B receipt/payslip HTML templates + html→pdf renderer"
```

---

## Task 4.5: Repos + Zod + last-used-rate prefill

> Spec §7.5: ad-hoc itemized lines with **last-used-rate prefill** (newest line for that party + subject). The repos also expose the create/get/list/void operations consumed by the orchestration (Task 4.6) and APIs. Issued docs are immutable; `void` only flips `voided` (keeps the number).

**Files:**
- Create: `lib/repos/receipts.ts`, `lib/repos/payslips.ts`, `lib/validation/receipt.ts`, `lib/validation/payslip.ts`
- Test: `tests/unit/receiptValidation.test.ts`, `tests/unit/payslipValidation.test.ts`, `tests/integration/lastRate.test.ts`

- [ ] **Step 1: Write the failing Zod validation tests**

```ts
// tests/unit/receiptValidation.test.ts
import { describe, it, expect } from 'vitest'
import { issueReceiptSchema } from '@/lib/validation/receipt'

const ok = {
  student_id: '00000000-0000-0000-0000-0000000a0001',
  currency: 'INR',
  note: 'June fees',
  discount: 200,
  lines: [
    { subject: 'Maths', hours: 7.5, rate: 200 },
    { subject: 'Science', hours: 6, rate: 200 },
  ],
}

describe('issueReceiptSchema', () => {
  it('accepts a valid payload', () => {
    expect(issueReceiptSchema.parse(ok)).toMatchObject({ student_id: ok.student_id })
  })
  it('defaults discount to null when omitted', () => {
    const { discount, ...rest } = ok
    expect(issueReceiptSchema.parse(rest).discount).toBeNull()
  })
  it('rejects an empty line list', () => {
    expect(() => issueReceiptSchema.parse({ ...ok, lines: [] })).toThrow()
  })
  it('rejects a non-uuid student_id', () => {
    expect(() => issueReceiptSchema.parse({ ...ok, student_id: 'nope' })).toThrow()
  })
  it('rejects negative hours/rate', () => {
    expect(() => issueReceiptSchema.parse({ ...ok, lines: [{ subject: 'X', hours: -1, rate: 200 }] })).toThrow()
    expect(() => issueReceiptSchema.parse({ ...ok, lines: [{ subject: 'X', hours: 1, rate: -1 }] })).toThrow()
  })
  it('rejects a blank subject', () => {
    expect(() => issueReceiptSchema.parse({ ...ok, lines: [{ subject: '', hours: 1, rate: 1 }] })).toThrow()
  })
  it('rejects a negative discount', () => {
    expect(() => issueReceiptSchema.parse({ ...ok, discount: -5 })).toThrow()
  })
  it('defaults currency to INR when omitted', () => {
    const { currency, ...rest } = ok
    expect(issueReceiptSchema.parse(rest).currency).toBe('INR')
  })
})
```

```ts
// tests/unit/payslipValidation.test.ts
import { describe, it, expect } from 'vitest'
import { issuePayslipSchema } from '@/lib/validation/payslip'

const ok = {
  teacher_id: '00000000-0000-0000-0000-0000000a0002',
  currency: 'INR',
  note: 'June pay',
  lines: [
    { label: 'Maths · Class 5', hours: 10, rate: 200 },
    { label: 'Science · Class 6', hours: 8, rate: 250 },
  ],
}

describe('issuePayslipSchema', () => {
  it('accepts a valid payload', () => {
    expect(issuePayslipSchema.parse(ok)).toMatchObject({ teacher_id: ok.teacher_id })
  })
  it('rejects an empty line list', () => {
    expect(() => issuePayslipSchema.parse({ ...ok, lines: [] })).toThrow()
  })
  it('rejects a non-uuid teacher_id', () => {
    expect(() => issuePayslipSchema.parse({ ...ok, teacher_id: 'nope' })).toThrow()
  })
  it('rejects a blank label', () => {
    expect(() => issuePayslipSchema.parse({ ...ok, lines: [{ label: '', hours: 1, rate: 1 }] })).toThrow()
  })
  it('has NO discount field (pay slips are a net total only)', () => {
    expect('discount' in issuePayslipSchema.parse(ok)).toBe(false)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/receiptValidation.test.ts tests/unit/payslipValidation.test.ts` — Expected: FAIL (no modules).

- [ ] **Step 3: Implement the Zod schemas**

`lib/validation/receipt.ts`:
```ts
import { z } from 'zod'

export const receiptLineSchema = z.object({
  subject: z.string().trim().min(1, 'subject required'),
  hours: z.number().nonnegative(),
  rate: z.number().nonnegative(),
})

export const issueReceiptSchema = z.object({
  student_id: z.string().uuid(),
  currency: z.string().trim().min(3).max(3).default('INR'),
  note: z.string().trim().max(500).optional(),
  discount: z.number().nonnegative().nullable().default(null),
  lines: z.array(receiptLineSchema).min(1, 'at least one line'),
})

export type IssueReceiptInput = z.infer<typeof issueReceiptSchema>
export type ReceiptLineInput = z.infer<typeof receiptLineSchema>
```

`lib/validation/payslip.ts`:
```ts
import { z } from 'zod'

export const payslipLineSchema = z.object({
  label: z.string().trim().min(1, 'label required'),
  hours: z.number().nonnegative(),
  rate: z.number().nonnegative(),
})

export const issuePayslipSchema = z.object({
  teacher_id: z.string().uuid(),
  currency: z.string().trim().min(3).max(3).default('INR'),
  note: z.string().trim().max(500).optional(),
  lines: z.array(payslipLineSchema).min(1, 'at least one line'),
})

export type IssuePayslipInput = z.infer<typeof issuePayslipSchema>
export type PayslipLineInput = z.infer<typeof payslipLineSchema>
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/receiptValidation.test.ts tests/unit/payslipValidation.test.ts` — Expected: PASS.

- [ ] **Step 5: Write the failing last-rate integration test**

```ts
// tests/integration/lastRate.test.ts
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(url, service)

const ids = {
  student: '00000000-0000-0000-0000-0000000a0201',
  teacher: '00000000-0000-0000-0000-0000000a0202',
  rOld: '00000000-0000-0000-0000-0000000e0201',
  rNew: '00000000-0000-0000-0000-0000000e0202',
  pOld: '00000000-0000-0000-0000-0000000f0201',
}

beforeAll(async () => {
  await admin.from('profiles').upsert([
    { id: ids.student, email: 'lr-stud@seed.test', role: 'student', status: 'active', class_level: '5' },
    { id: ids.teacher, email: 'lr-teach@seed.test', role: 'teacher', status: 'active' },
  ], { onConflict: 'id' })
  // older receipt with Maths @ 180, newer with Maths @ 220 -> newest wins
  await admin.from('receipts').upsert([
    { id: ids.rOld, number: 'CEA-R-2097-0001', student_id: ids.student, student_name_snapshot: 'S', class_snapshot: '5', issue_date: '2097-01-01', currency: 'INR', subtotal: 180, total: 180, drive_file_id: 'x', drive_link: 'x', created_by: ids.student, created_at: '2097-01-01T00:00:00Z' },
    { id: ids.rNew, number: 'CEA-R-2097-0002', student_id: ids.student, student_name_snapshot: 'S', class_snapshot: '5', issue_date: '2097-02-01', currency: 'INR', subtotal: 220, total: 220, drive_file_id: 'x', drive_link: 'x', created_by: ids.student, created_at: '2097-02-01T00:00:00Z' },
  ], { onConflict: 'id' })
  await admin.from('receipt_lines').insert([
    { receipt_id: ids.rOld, subject: 'Maths', hours: 1, rate: 180, amount: 180 },
    { receipt_id: ids.rNew, subject: 'Maths', hours: 1, rate: 220, amount: 220 },
  ])
  await admin.from('payslips').upsert({ id: ids.pOld, number: 'CEA-P-2097-0001', teacher_id: ids.teacher, teacher_name_snapshot: 'T', issue_date: '2097-01-01', currency: 'INR', total: 300, drive_file_id: 'x', drive_link: 'x', created_by: ids.teacher }, { onConflict: 'id' })
  await admin.from('payslip_lines').insert({ payslip_id: ids.pOld, label: 'Maths · Class 5', hours: 1, rate: 300, amount: 300 })
})

afterAll(async () => {
  await admin.from('receipt_lines').delete().in('receipt_id', [ids.rOld, ids.rNew])
  await admin.from('receipts').delete().in('id', [ids.rOld, ids.rNew])
  await admin.from('payslip_lines').delete().eq('payslip_id', ids.pOld)
  await admin.from('payslips').delete().eq('id', ids.pOld)
  await admin.from('profiles').delete().in('id', [ids.student, ids.teacher])
})

import { lastRateFor as lastReceiptRate } from '@/lib/repos/receipts'
import { lastRateFor as lastPayslipRate } from '@/lib/repos/payslips'

describe('lastRateFor (receipts)', () => {
  it('returns the rate from the newest matching line for that student+subject', async () => {
    expect(await lastReceiptRate(ids.student, 'Maths', admin)).toBe(220)
  })
  it('returns null when no prior line exists', async () => {
    expect(await lastReceiptRate(ids.student, 'Physics', admin)).toBeNull()
  })
})

describe('lastRateFor (payslips)', () => {
  it('returns the rate from the newest matching line for that teacher+label', async () => {
    expect(await lastPayslipRate(ids.teacher, 'Maths · Class 5', admin)).toBe(300)
  })
  it('returns null when no prior line exists', async () => {
    expect(await lastPayslipRate(ids.teacher, 'Unknown', admin)).toBeNull()
  })
})
```

- [ ] **Step 6: Run — must fail** — Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/lastRate.test.ts` — Expected: FAIL (no repo modules).

- [ ] **Step 7: Implement** — `lib/repos/receipts.ts`

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ReceiptRow = {
  id: string; number: string; student_id: string; student_name_snapshot: string
  class_snapshot: string | null; issue_date: string; currency: string; note: string | null
  subtotal: number; discount: number | null; total: number
  drive_file_id: string; drive_link: string; voided: boolean; created_by: string; created_at: string
}
export type ReceiptLineRow = {
  id: string; receipt_id: string; subject: string; hours: number; rate: number; amount: number
}

export type NewReceipt = Omit<ReceiptRow, 'id' | 'created_at' | 'voided'>
export type NewReceiptLine = Omit<ReceiptLineRow, 'id' | 'receipt_id'>

/** Insert a receipt header + its lines using the service-role client (admin issue path). */
export async function createReceipt(
  header: NewReceipt,
  lines: NewReceiptLine[],
  client?: SupabaseClient,
): Promise<ReceiptRow> {
  const sb = client ?? createAdminClient()
  const { data, error } = await sb.from('receipts').insert(header).select('*').single()
  if (error) throw new Error(`createReceipt: ${error.message}`)
  const receipt = data as ReceiptRow
  const lineRows = lines.map((l) => ({ ...l, receipt_id: receipt.id }))
  const { error: lineErr } = await sb.from('receipt_lines').insert(lineRows)
  if (lineErr) throw new Error(`createReceipt lines: ${lineErr.message}`)
  return receipt
}

/** Read one receipt + lines via the RLS-enforced user client (own/admin per policy). */
export async function getReceipt(id: string): Promise<{ receipt: ReceiptRow; lines: ReceiptLineRow[] } | null> {
  const sb = await createClient()
  const { data, error } = await sb.from('receipts').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getReceipt: ${error.message}`)
  if (!data) return null
  const { data: lines, error: lineErr } = await sb.from('receipt_lines').select('*').eq('receipt_id', id).order('created_at')
  if (lineErr) throw new Error(`getReceipt lines: ${lineErr.message}`)
  return { receipt: data as ReceiptRow, lines: (lines ?? []) as ReceiptLineRow[] }
}

/** List receipts visible to the caller (RLS scopes to own/admin). Newest first. */
export async function listReceipts(): Promise<ReceiptRow[]> {
  const sb = await createClient()
  const { data, error } = await sb.from('receipts').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(`listReceipts: ${error.message}`)
  return (data ?? []) as ReceiptRow[]
}

/** Mark a receipt voided (keeps the number; immutable otherwise). Service-role. */
export async function voidReceipt(id: string, client?: SupabaseClient): Promise<ReceiptRow> {
  const sb = client ?? createAdminClient()
  const { data, error } = await sb.from('receipts').update({ voided: true }).eq('id', id).select('*').single()
  if (error) throw new Error(`voidReceipt: ${error.message}`)
  return data as ReceiptRow
}

/**
 * Last-used rate for prefill: the rate on the newest receipt line for this student + subject.
 * Joins lines to their receipt to order by the receipt's created_at. Returns null when none.
 */
export async function lastRateFor(
  studentId: string,
  subject: string,
  client?: SupabaseClient,
): Promise<number | null> {
  const sb = client ?? createAdminClient()
  const { data, error } = await sb
    .from('receipt_lines')
    .select('rate, receipts!inner(student_id, created_at)')
    .eq('subject', subject)
    .eq('receipts.student_id', studentId)
    .order('created_at', { foreignTable: 'receipts', ascending: false })
    .limit(1)
  if (error) throw new Error(`lastRateFor: ${error.message}`)
  const row = data?.[0] as { rate: number } | undefined
  return row ? Number(row.rate) : null
}
```

`lib/repos/payslips.ts`:
```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type PayslipRow = {
  id: string; number: string; teacher_id: string; teacher_name_snapshot: string
  issue_date: string; currency: string; note: string | null; total: number
  drive_file_id: string; drive_link: string; voided: boolean; created_by: string; created_at: string
}
export type PayslipLineRow = {
  id: string; payslip_id: string; label: string; hours: number; rate: number; amount: number
}

export type NewPayslip = Omit<PayslipRow, 'id' | 'created_at' | 'voided'>
export type NewPayslipLine = Omit<PayslipLineRow, 'id' | 'payslip_id'>

export async function createPayslip(
  header: NewPayslip,
  lines: NewPayslipLine[],
  client?: SupabaseClient,
): Promise<PayslipRow> {
  const sb = client ?? createAdminClient()
  const { data, error } = await sb.from('payslips').insert(header).select('*').single()
  if (error) throw new Error(`createPayslip: ${error.message}`)
  const payslip = data as PayslipRow
  const lineRows = lines.map((l) => ({ ...l, payslip_id: payslip.id }))
  const { error: lineErr } = await sb.from('payslip_lines').insert(lineRows)
  if (lineErr) throw new Error(`createPayslip lines: ${lineErr.message}`)
  return payslip
}

export async function getPayslip(id: string): Promise<{ payslip: PayslipRow; lines: PayslipLineRow[] } | null> {
  const sb = await createClient()
  const { data, error } = await sb.from('payslips').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getPayslip: ${error.message}`)
  if (!data) return null
  const { data: lines, error: lineErr } = await sb.from('payslip_lines').select('*').eq('payslip_id', id).order('created_at')
  if (lineErr) throw new Error(`getPayslip lines: ${lineErr.message}`)
  return { payslip: data as PayslipRow, lines: (lines ?? []) as PayslipLineRow[] }
}

export async function listPayslips(): Promise<PayslipRow[]> {
  const sb = await createClient()
  const { data, error } = await sb.from('payslips').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(`listPayslips: ${error.message}`)
  return (data ?? []) as PayslipRow[]
}

export async function voidPayslip(id: string, client?: SupabaseClient): Promise<PayslipRow> {
  const sb = client ?? createAdminClient()
  const { data, error } = await sb.from('payslips').update({ voided: true }).eq('id', id).select('*').single()
  if (error) throw new Error(`voidPayslip: ${error.message}`)
  return data as PayslipRow
}

/** Last-used rate for prefill: newest payslip line for this teacher + label. */
export async function lastRateFor(
  teacherId: string,
  label: string,
  client?: SupabaseClient,
): Promise<number | null> {
  const sb = client ?? createAdminClient()
  const { data, error } = await sb
    .from('payslip_lines')
    .select('rate, payslips!inner(teacher_id, created_at)')
    .eq('label', label)
    .eq('payslips.teacher_id', teacherId)
    .order('created_at', { foreignTable: 'payslips', ascending: false })
    .limit(1)
  if (error) throw new Error(`lastRateFor: ${error.message}`)
  const row = data?.[0] as { rate: number } | undefined
  return row ? Number(row.rate) : null
}
```

- [ ] **Step 8: Run — must pass** — Run: `node --env-file=.env.local node_modules/.bin/vitest run tests/integration/lastRate.test.ts` — Expected: PASS (newest rate wins for receipts + pay slips; null when none).

- [ ] **Step 9: Commit**

```bash
git add lib/repos/receipts.ts lib/repos/payslips.ts lib/validation/receipt.ts lib/validation/payslip.ts tests/unit/receiptValidation.test.ts tests/unit/payslipValidation.test.ts tests/integration/lastRate.test.ts
git commit -m "feat: finance repos + zod schemas + last-used-rate prefill"
```

---

## Task 4.6: Issue orchestration + POST APIs

> Spec §7.5 generate flow: admin form → POST → Zod-validate → `computeTotals` → `allocateNumber` → render template → `htmlToPdf` → upload server→Drive `Cert-Ed Academia/Finance/Receipts|Pay Slips/` (via `ensureFolderPath`) → insert record + lines → `audit_log`. **Admin-only.** The orchestration is unit-tested with Drive + PDF + repos mocked so it is deterministic.

**Files:**
- Create: `lib/finance/issueReceipt.ts`, `lib/finance/issuePayslip.ts`, `app/api/receipts/route.ts`, `app/api/payslips/route.ts`
- Test: `tests/unit/issueReceipt.test.ts`, `tests/integration/receipts-api.test.ts`

- [ ] **Step 1: Write the failing orchestration test** (mock Drive, PDF, repos, counters, audit)

```ts
// tests/unit/issueReceipt.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const allocateNumber = vi.fn(async () => 'CEA-R-2026-0001')
vi.mock('@/lib/repos/documentCounters', () => ({ allocateNumber: (...a: any[]) => allocateNumber(...a) }))

const htmlToPdf = vi.fn(async () => Buffer.from('%PDF-fake'))
vi.mock('@/lib/pdf/renderPdf', () => ({ htmlToPdf: (...a: any[]) => htmlToPdf(...a) }))

const renderReceiptHtml = vi.fn(() => '<html>receipt</html>')
vi.mock('@/lib/pdf/receiptTemplate', () => ({ renderReceiptHtml: (...a: any[]) => renderReceiptHtml(...a) }))

const uploadPdfToDrive = vi.fn(async () => ({ driveFileId: 'drive-1', driveLink: 'http://d/1' }))
vi.mock('@/lib/finance/uploadPdf', () => ({ uploadPdfToDrive: (...a: any[]) => uploadPdfToDrive(...a) }))

const createReceipt = vi.fn(async (header: any) => ({ id: 'r-1', ...header }))
vi.mock('@/lib/repos/receipts', () => ({ createReceipt: (...a: any[]) => createReceipt(...a) }))

const writeAudit = vi.fn(async () => {})
vi.mock('@/lib/audit', () => ({ writeAudit: (...a: any[]) => writeAudit(...a) }))

const getOrgSettings = vi.fn(async () => ({
  institute_name: 'Cert-Ed Academia', contact_email: 'i@c', contact_phone: '+91',
  bank_account: 'A', bank_ifsc: 'I', bank_branch: 'B', terms_text: 'T',
  signatory_name: 'S', signatory_title: 'CEO', signature_mode: 'text', signature_text: 'Digitally signed',
  default_currency: 'INR', timezone: 'Asia/Kolkata', receipt_prefix: 'CEA-R', payslip_prefix: 'CEA-P',
}))
vi.mock('@/lib/repos/orgSettings', () => ({ getOrgSettings: (...a: any[]) => getOrgSettings(...a), receiptNumber: () => '' }))

import { issueReceipt } from '@/lib/finance/issueReceipt'

const studentProfile = { id: 'stud-1', full_name: 'Aadhya', class_level: '5' }

beforeEach(() => { vi.clearAllMocks(); allocateNumber.mockResolvedValue('CEA-R-2026-0001') })

describe('issueReceipt orchestration', () => {
  const input = {
    student_id: 'stud-1', currency: 'INR', note: 'June', discount: 200,
    lines: [{ subject: 'Maths', hours: 7.5, rate: 200 }, { subject: 'Science', hours: 6, rate: 200 }],
  }

  it('computes totals, allocates a number, renders+uploads the PDF, inserts, and audits — in order', async () => {
    const out = await issueReceipt(input as any, { actorId: 'admin-1', student: studentProfile as any })
    expect(allocateNumber).toHaveBeenCalledWith('receipt', expect.any(Number), 'CEA-R')
    // totals: subtotal 2700, discount 200 -> total 2500, with computed line amounts
    const header = createReceipt.mock.calls[0][0]
    expect(header.subtotal).toBe(2700)
    expect(header.discount).toBe(200)
    expect(header.total).toBe(2500)
    expect(header.number).toBe('CEA-R-2026-0001')
    expect(header.student_name_snapshot).toBe('Aadhya')
    expect(header.class_snapshot).toBe('5')
    expect(header.drive_file_id).toBe('drive-1')
    const lines = createReceipt.mock.calls[0][1]
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ subject: 'Maths', hours: 7.5, rate: 200, amount: 1500 })
    expect(htmlToPdf).toHaveBeenCalledWith('<html>receipt</html>')
    expect(uploadPdfToDrive).toHaveBeenCalled()
    expect(writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actor_id: 'admin-1', action: 'issue_receipt', entity_type: 'receipt', entity_id: 'r-1',
    }))
    expect(out.id).toBe('r-1')
  })

  it('omits the discount (null) when none is supplied: total === subtotal', async () => {
    await issueReceipt({ ...input, discount: null } as any, { actorId: 'admin-1', student: studentProfile as any })
    const header = createReceipt.mock.calls[0][0]
    expect(header.discount).toBeNull()
    expect(header.total).toBe(2700)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/issueReceipt.test.ts` — Expected: FAIL (no modules).

- [ ] **Step 3: Implement the Drive upload helper** — `lib/finance/uploadPdf.ts`

```ts
import 'server-only'
import { Readable } from 'node:stream'
import { getDriveClient } from '@/lib/drive/auth'
import { ensureFolderPath } from '@/lib/drive/folders'

/**
 * Upload a generated PDF buffer to `Cert-Ed Academia/Finance/<subfolder>/` and return
 * the Drive file id + a webViewLink. The file is created private (Drive default for the
 * institute account); downloads go through the access-checked endpoint (Task 4.8).
 */
export async function uploadPdfToDrive(
  buffer: Buffer,
  fileName: string,
  subfolder: 'Receipts' | 'Pay Slips',
): Promise<{ driveFileId: string; driveLink: string }> {
  const drive = await getDriveClient()
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? 'root'
  const folderId = await ensureFolderPath(drive, rootId, ['Cert-Ed Academia', 'Finance', subfolder])
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId], mimeType: 'application/pdf' },
    media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  })
  const driveFileId = res.data.id as string
  const driveLink = (res.data.webViewLink as string) ?? `https://drive.google.com/file/d/${driveFileId}/view`
  return { driveFileId, driveLink }
}
```

- [ ] **Step 4: Implement the receipt orchestration** — `lib/finance/issueReceipt.ts`

```ts
import 'server-only'
import { computeTotals, lineAmount } from '@/lib/money'
import { allocateNumber } from '@/lib/repos/documentCounters'
import { getOrgSettings } from '@/lib/repos/orgSettings'
import { renderReceiptHtml, type ReceiptLineView } from '@/lib/pdf/receiptTemplate'
import { htmlToPdf } from '@/lib/pdf/renderPdf'
import { uploadPdfToDrive } from '@/lib/finance/uploadPdf'
import { createReceipt, type ReceiptRow } from '@/lib/repos/receipts'
import { writeAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import type { IssueReceiptInput } from '@/lib/validation/receipt'

type StudentRef = { id: string; full_name: string | null; class_level: string | null }

/** Display date for the PDF, e.g. "02 Jun 2026". */
function displayDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

/**
 * Full receipt issue: totals → number → HTML → PDF → Drive → DB insert (header+lines) → audit.
 * Admin-only is enforced by the caller (the API route). Returns the inserted receipt row.
 */
export async function issueReceipt(
  input: IssueReceiptInput,
  ctx: { actorId: string; student: StudentRef },
): Promise<ReceiptRow> {
  const org = await getOrgSettings()
  const { subtotal, total } = computeTotals(input.lines, input.discount)
  const now = new Date()
  const year = now.getUTCFullYear()
  const number = await allocateNumber('receipt', year, org.receipt_prefix)

  const computedLines = input.lines.map((l) => ({
    subject: l.subject, hours: l.hours, rate: l.rate, amount: lineAmount(l.hours, l.rate),
  }))
  const viewLines: ReceiptLineView[] = computedLines.map((l) => ({ ...l }))

  const html = renderReceiptHtml(
    {
      number,
      issueDate: displayDate(now),
      studentName: ctx.student.full_name ?? 'Student',
      classLabel: ctx.student.class_level,
      currency: input.currency,
      lines: viewLines,
      subtotal,
      discount: input.discount,
      total,
    },
    org,
  )
  const pdf = await htmlToPdf(html)
  const { driveFileId, driveLink } = await uploadPdfToDrive(pdf, `${number}.pdf`, 'Receipts')

  const receipt = await createReceipt(
    {
      number,
      student_id: input.student_id,
      student_name_snapshot: ctx.student.full_name ?? 'Student',
      class_snapshot: ctx.student.class_level,
      issue_date: now.toISOString().slice(0, 10),
      currency: input.currency,
      note: input.note ?? null,
      subtotal,
      discount: input.discount,
      total,
      drive_file_id: driveFileId,
      drive_link: driveLink,
      created_by: ctx.actorId,
    },
    computedLines,
  )

  const admin = createAdminClient()
  await writeAudit(admin, {
    actor_id: ctx.actorId, action: 'issue_receipt', entity_type: 'receipt', entity_id: receipt.id,
  })
  return receipt
}
```

`lib/finance/issuePayslip.ts`:
```ts
import 'server-only'
import { lineAmount, round2OrThrow } from '@/lib/money'
import { allocateNumber } from '@/lib/repos/documentCounters'
import { getOrgSettings } from '@/lib/repos/orgSettings'
import { renderPayslipHtml, type PayslipLineView } from '@/lib/pdf/payslipTemplate'
import { htmlToPdf } from '@/lib/pdf/renderPdf'
import { uploadPdfToDrive } from '@/lib/finance/uploadPdf'
import { createPayslip, type PayslipRow } from '@/lib/repos/payslips'
import { writeAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import type { IssuePayslipInput } from '@/lib/validation/payslip'

type TeacherRef = { id: string; full_name: string | null }

function displayDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

/** Pay slip issue: net total → number → HTML → PDF → Drive → insert → audit. Admin-only (caller-enforced). */
export async function issuePayslip(
  input: IssuePayslipInput,
  ctx: { actorId: string; teacher: TeacherRef },
): Promise<PayslipRow> {
  const org = await getOrgSettings()
  const computedLines = input.lines.map((l) => ({
    label: l.label, hours: l.hours, rate: l.rate, amount: lineAmount(l.hours, l.rate),
  }))
  const total = round2OrThrow(computedLines.reduce((s, l) => s + l.amount, 0))
  const now = new Date()
  const year = now.getUTCFullYear()
  const number = await allocateNumber('payslip', year, org.payslip_prefix)

  const viewLines: PayslipLineView[] = computedLines.map((l) => ({ ...l }))
  const html = renderPayslipHtml(
    {
      number,
      issueDate: displayDate(now),
      teacherName: ctx.teacher.full_name ?? 'Teacher',
      currency: input.currency,
      lines: viewLines,
      total,
    },
    org,
  )
  const pdf = await htmlToPdf(html)
  const { driveFileId, driveLink } = await uploadPdfToDrive(pdf, `${number}.pdf`, 'Pay Slips')

  const payslip = await createPayslip(
    {
      number,
      teacher_id: input.teacher_id,
      teacher_name_snapshot: ctx.teacher.full_name ?? 'Teacher',
      issue_date: now.toISOString().slice(0, 10),
      currency: input.currency,
      note: input.note ?? null,
      total,
      drive_file_id: driveFileId,
      drive_link: driveLink,
      created_by: ctx.actorId,
    },
    computedLines,
  )

  const admin = createAdminClient()
  await writeAudit(admin, {
    actor_id: ctx.actorId, action: 'issue_payslip', entity_type: 'payslip', entity_id: payslip.id,
  })
  return payslip
}
```

> Add a tiny `round2OrThrow(n)` export to `lib/money.ts` (re-using the internal `round2`) so the pay slip net total uses the same rounding as line amounts. (Receipts use `computeTotals`, which already rounds; pay slips have no discount so they sum rounded line amounts and round once more.)
>
> ```ts
> // append to lib/money.ts
> export function round2OrThrow(n: number): number {
>   if (Number.isNaN(n)) throw new Error('invalid amount')
>   return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100
> }
> ```

- [ ] **Step 5: Extend `lib/audit.ts` action union** — add the finance actions to the `AuditAction` type in `lib/audit.ts` (Phase 1):

```ts
// in lib/audit.ts — extend the union (do not remove the Phase 1 entries)
export type AuditAction =
  | 'revoke' | 'restore' | 'add_user'
  | 'issue_receipt' | 'void_receipt' | 'issue_payslip' | 'void_payslip'
```

- [ ] **Step 6: Run the orchestration test — must pass** — Run: `npm run test -- tests/unit/issueReceipt.test.ts` — Expected: PASS (totals + number + render + upload + insert + audit in order; null-discount path).

- [ ] **Step 7: Write the failing receipts API test** (admin-only guard + 201 envelope)

```ts
// tests/integration/receipts-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
vi.mock('@/lib/auth/profile', () => ({ getProfile: vi.fn(async () => profile) }))

const issueReceipt = vi.fn(async () => ({ id: 'r-1', number: 'CEA-R-2026-0001' }))
vi.mock('@/lib/finance/issueReceipt', () => ({ issueReceipt: (...a: any[]) => issueReceipt(...a) }))

const listReceipts = vi.fn(async () => [{ id: 'r-1' }])
vi.mock('@/lib/repos/receipts', () => ({ listReceipts: (...a: any[]) => listReceipts(...a) }))

// admin client used to look up the student snapshot fields
const single = vi.fn(async () => ({ data: { id: 'stud-1', full_name: 'Aadhya', class_level: '5' }, error: null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }),
}))

import { GET, POST } from '@/app/api/receipts/route'

const body = (o: any) => new Request('http://t/api/receipts', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o),
})

const valid = {
  student_id: '00000000-0000-0000-0000-0000000a0001', currency: 'INR',
  lines: [{ subject: 'Maths', hours: 7.5, rate: 200 }],
}

beforeEach(() => { vi.clearAllMocks(); profile.role = 'admin'; profile.status = 'active'; issueReceipt.mockResolvedValue({ id: 'r-1', number: 'CEA-R-2026-0001' } as any) })

describe('POST /api/receipts', () => {
  it('admin issues a receipt -> 201 with the row', async () => {
    const res = await POST(body(valid))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data.number).toBe('CEA-R-2026-0001')
    expect(issueReceipt).toHaveBeenCalled()
  })
  it('a teacher is forbidden (403)', async () => {
    profile.role = 'teacher'
    const res = await POST(body(valid))
    expect(res.status).toBe(403)
    expect(issueReceipt).not.toHaveBeenCalled()
  })
  it('a student is forbidden (403)', async () => {
    profile.role = 'student'
    const res = await POST(body(valid))
    expect(res.status).toBe(403)
  })
  it('rejects an invalid payload (400)', async () => {
    const res = await POST(body({ student_id: 'nope', lines: [] }))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })
})

describe('GET /api/receipts', () => {
  it('returns the RLS-scoped list', async () => {
    const res = await GET(new Request('http://t/api/receipts'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
  })
})
```

- [ ] **Step 8: Run — must fail** — Run: `npm run test -- tests/integration/receipts-api.test.ts` — Expected: FAIL (no route).

- [ ] **Step 9: Implement the receipts route** — `app/api/receipts/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { issueReceiptSchema } from '@/lib/validation/receipt'
import { issueReceipt } from '@/lib/finance/issueReceipt'
import { listReceipts } from '@/lib/repos/receipts'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function GET() {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  const data = await listReceipts() // RLS scopes to own (student) / all (admin)
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'admin') return fail('forbidden', 403)

  let payload: unknown
  try { payload = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = issueReceiptSchema.safeParse(payload)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  const admin = createAdminClient()
  const { data: student, error } = await admin
    .from('profiles').select('id, full_name, class_level')
    .eq('id', parsed.data.student_id).single()
  if (error || !student) return fail('student-not-found', 404)
  if ((student as any).role && (student as any).role !== 'student') { /* allow snapshot anyway */ }

  const receipt = await issueReceipt(parsed.data, { actorId: profile.id, student: student as any })
  return NextResponse.json({ success: true, data: receipt }, { status: 201 })
}
```

`app/api/payslips/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { issuePayslipSchema } from '@/lib/validation/payslip'
import { issuePayslip } from '@/lib/finance/issuePayslip'
import { listPayslips } from '@/lib/repos/payslips'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function GET() {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  const data = await listPayslips() // RLS scopes to own (teacher) / all (admin)
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'admin') return fail('forbidden', 403)

  let payload: unknown
  try { payload = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = issuePayslipSchema.safeParse(payload)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  const admin = createAdminClient()
  const { data: teacher, error } = await admin
    .from('profiles').select('id, full_name')
    .eq('id', parsed.data.teacher_id).single()
  if (error || !teacher) return fail('teacher-not-found', 404)

  const payslip = await issuePayslip(parsed.data, { actorId: profile.id, teacher: teacher as any })
  return NextResponse.json({ success: true, data: payslip }, { status: 201 })
}
```

- [ ] **Step 10: Run the receipts API test — must pass** — Run: `npm run test -- tests/integration/receipts-api.test.ts` — Expected: PASS (admin 201; teacher/student 403; bad payload 400; GET 200).

- [ ] **Step 11: Commit**

```bash
git add lib/finance "app/api/receipts/route.ts" "app/api/payslips/route.ts" tests/unit/issueReceipt.test.ts tests/integration/receipts-api.test.ts
git commit -m "feat: receipt/payslip issue orchestration + admin POST APIs"
```

---

## Task 4.7: Void (+ reissue) APIs

> Spec §7.5/§8: issued documents are immutable; corrections via **void + reissue** — `voided=true` keeps the number; a corrected doc is a fresh issue (new number) via the Task 4.6 POST. Void is admin-only and audited. "Reissue" needs no new endpoint: after voiding, the admin POSTs a corrected receipt/pay slip, which allocates a new number.

**Files:**
- Create: `app/api/receipts/[id]/void/route.ts`, `app/api/payslips/[id]/void/route.ts`
- Test: `tests/integration/void-api.test.ts`

- [ ] **Step 1: Write the failing void test**

```ts
// tests/integration/void-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
vi.mock('@/lib/auth/profile', () => ({ getProfile: vi.fn(async () => profile) }))

const voidReceipt = vi.fn(async (id: string) => ({ id, number: 'CEA-R-2026-0001', voided: true }))
vi.mock('@/lib/repos/receipts', () => ({ voidReceipt: (...a: any[]) => voidReceipt(...a) }))

const writeAudit = vi.fn(async () => {})
vi.mock('@/lib/audit', () => ({ writeAudit: (...a: any[]) => writeAudit(...a) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { POST } from '@/app/api/receipts/[id]/void/route'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = () => new Request('http://t/api/receipts/r-1/void', { method: 'POST' })

beforeEach(() => { vi.clearAllMocks(); profile.role = 'admin'; profile.status = 'active' })

describe('POST /api/receipts/[id]/void', () => {
  it('admin voids (keeps the number) and audits', async () => {
    const res = await POST(req(), ctx('r-1'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.voided).toBe(true)
    expect(json.data.number).toBe('CEA-R-2026-0001') // number preserved
    expect(voidReceipt).toHaveBeenCalledWith('r-1', expect.anything())
    expect(writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actor_id: 'admin-1', action: 'void_receipt', entity_type: 'receipt', entity_id: 'r-1',
    }))
  })
  it('a non-admin is forbidden (403)', async () => {
    profile.role = 'teacher'
    const res = await POST(req(), ctx('r-1'))
    expect(res.status).toBe(403)
    expect(voidReceipt).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/integration/void-api.test.ts` — Expected: FAIL (no route).

- [ ] **Step 3: Implement the receipt void route** — `app/api/receipts/[id]/void/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { voidReceipt } from '@/lib/repos/receipts'
import { writeAudit } from '@/lib/audit'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'admin') return fail('forbidden', 403)

  const admin = createAdminClient()
  const receipt = await voidReceipt(id, admin)
  await writeAudit(admin, {
    actor_id: profile.id, action: 'void_receipt', entity_type: 'receipt', entity_id: id,
  })
  return NextResponse.json({ success: true, data: receipt })
}
```

`app/api/payslips/[id]/void/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { voidPayslip } from '@/lib/repos/payslips'
import { writeAudit } from '@/lib/audit'

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'admin') return fail('forbidden', 403)

  const admin = createAdminClient()
  const payslip = await voidPayslip(id, admin)
  await writeAudit(admin, {
    actor_id: profile.id, action: 'void_payslip', entity_type: 'payslip', entity_id: id,
  })
  return NextResponse.json({ success: true, data: payslip })
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/integration/void-api.test.ts` — Expected: PASS (admin voids + audits, number kept; non-admin 403).

- [ ] **Step 5: Commit**

```bash
git add "app/api/receipts/[id]/void" "app/api/payslips/[id]/void" tests/integration/void-api.test.ts
git commit -m "feat: void receipt/payslip APIs (keep number, audit; reissue via new POST)"
```

---

## Task 4.8: Access-checked PDF download endpoints

> Spec §6/§8: downloads are access-checked (own or admin), then re-streamed/redirected from Drive (files never "anyone with link"). RLS already scopes `getReceipt`/`getPayslip` to own/admin, so a successful read is itself the access check; we then stream the bytes from Drive.

**Files:**
- Create: `app/api/receipts/[id]/pdf/route.ts`, `app/api/payslips/[id]/pdf/route.ts`, `lib/finance/downloadPdf.ts`
- Test: `tests/integration/receipt-pdf.test.ts`

- [ ] **Step 1: Write the failing download test** (own → 200 stream; not-own → 404 via RLS; PDF content-type)

```ts
// tests/integration/receipt-pdf.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'stud-1', email: 's@x.c', role: 'student', status: 'active' } as any
vi.mock('@/lib/auth/profile', () => ({ getProfile: vi.fn(async () => profile) }))

// getReceipt returns null when RLS hides the row (not own / not admin)
const getReceipt = vi.fn(async () => ({
  receipt: { id: 'r-1', number: 'CEA-R-2026-0001', drive_file_id: 'drive-1' }, lines: [],
}))
vi.mock('@/lib/repos/receipts', () => ({ getReceipt: (...a: any[]) => getReceipt(...a) }))

const fetchDrivePdf = vi.fn(async () => Buffer.from('%PDF-bytes'))
vi.mock('@/lib/finance/downloadPdf', () => ({ fetchDrivePdf: (...a: any[]) => fetchDrivePdf(...a) }))

import { GET } from '@/app/api/receipts/[id]/pdf/route'
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = () => new Request('http://t/api/receipts/r-1/pdf')

beforeEach(() => { vi.clearAllMocks(); getReceipt.mockResolvedValue({ receipt: { id: 'r-1', number: 'CEA-R-2026-0001', drive_file_id: 'drive-1' }, lines: [] } as any) })

describe('GET /api/receipts/[id]/pdf', () => {
  it('streams the PDF for an authorized reader', async () => {
    const res = await GET(req(), ctx('r-1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('CEA-R-2026-0001.pdf')
    expect(fetchDrivePdf).toHaveBeenCalledWith('drive-1')
  })
  it('returns 404 when RLS hides the receipt (not own / not admin)', async () => {
    getReceipt.mockResolvedValue(null as any)
    const res = await GET(req(), ctx('r-1'))
    expect(res.status).toBe(404)
    expect(fetchDrivePdf).not.toHaveBeenCalled()
  })
  it('returns 401 when not signed in', async () => {
    profile.status = 'disabled'
    const res = await GET(req(), ctx('r-1'))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/integration/receipt-pdf.test.ts` — Expected: FAIL (no route).

- [ ] **Step 3: Implement the Drive byte fetcher** — `lib/finance/downloadPdf.ts`

```ts
import 'server-only'
import { getDriveClient } from '@/lib/drive/auth'

/** Fetch a Drive file's raw bytes as a Buffer (server-side; uses the institute Drive token). */
export async function fetchDrivePdf(driveFileId: string): Promise<Buffer> {
  const drive = await getDriveClient()
  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}
```

- [ ] **Step 4: Implement the receipt pdf route** — `app/api/receipts/[id]/pdf/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { getReceipt } from '@/lib/repos/receipts'
import { fetchDrivePdf } from '@/lib/finance/downloadPdf'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ success: false, error: 'no-access' }, { status: 401 })
  }
  // getReceipt uses the RLS-enforced client: returns null if the caller may not see it.
  const result = await getReceipt(id)
  if (!result) return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })

  const bytes = await fetchDrivePdf(result.receipt.drive_file_id)
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${result.receipt.number}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
```

`app/api/payslips/[id]/pdf/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { getPayslip } from '@/lib/repos/payslips'
import { fetchDrivePdf } from '@/lib/finance/downloadPdf'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ success: false, error: 'no-access' }, { status: 401 })
  }
  const result = await getPayslip(id)
  if (!result) return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })

  const bytes = await fetchDrivePdf(result.payslip.drive_file_id)
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${result.payslip.number}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
```

- [ ] **Step 5: Run — must pass** — Run: `npm run test -- tests/integration/receipt-pdf.test.ts` — Expected: PASS (authorized stream with PDF headers; hidden → 404; signed-out → 401).

- [ ] **Step 6: Commit**

```bash
git add "app/api/receipts/[id]/pdf" "app/api/payslips/[id]/pdf" lib/finance/downloadPdf.ts tests/integration/receipt-pdf.test.ts
git commit -m "feat: access-checked receipt/payslip PDF download endpoints"
```

---

## Task 4.9: Admin finance UI + org_settings editor

> Spec §6 `/admin/finance` (issue receipt + pay slip with itemized `{subject,hours,rate}` lines, last-used-rate prefill, live total) and `/admin/settings` (org_settings editor). The forms POST to the Task 4.6 APIs; the live total mirrors `computeTotals` client-side. A small prefill endpoint exposes `lastRateFor`.

**Files:**
- Create: `app/(app)/admin/finance/page.tsx`, `app/(app)/admin/finance/IssueReceiptForm.tsx`, `app/(app)/admin/finance/IssuePayslipForm.tsx`, `app/api/receipts/last-rate/route.ts`, `app/api/payslips/last-rate/route.ts`, `app/(app)/admin/settings/page.tsx`, `app/(app)/admin/settings/actions.ts`
- Test: `tests/integration/last-rate-api.test.ts`

- [ ] **Step 1: Write the failing last-rate API test** (admin-only prefill)

```ts
// tests/integration/last-rate-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'admin-1', role: 'admin', status: 'active' } as any
vi.mock('@/lib/auth/profile', () => ({ getProfile: vi.fn(async () => profile) }))

const lastRateFor = vi.fn(async () => 220)
vi.mock('@/lib/repos/receipts', () => ({ lastRateFor: (...a: any[]) => lastRateFor(...a) }))

import { GET } from '@/app/api/receipts/last-rate/route'
const req = (qs: string) => new Request(`http://t/api/receipts/last-rate?${qs}`)

beforeEach(() => { vi.clearAllMocks(); profile.role = 'admin'; profile.status = 'active'; lastRateFor.mockResolvedValue(220) })

describe('GET /api/receipts/last-rate', () => {
  it('admin gets the last rate for student+subject', async () => {
    const res = await GET(req('student_id=00000000-0000-0000-0000-0000000a0001&subject=Maths'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.rate).toBe(220)
  })
  it('returns null rate when none exists', async () => {
    lastRateFor.mockResolvedValue(null)
    const res = await GET(req('student_id=00000000-0000-0000-0000-0000000a0001&subject=Physics'))
    const json = await res.json()
    expect(json.data.rate).toBeNull()
  })
  it('a non-admin is forbidden (403)', async () => {
    profile.role = 'teacher'
    const res = await GET(req('student_id=00000000-0000-0000-0000-0000000a0001&subject=Maths'))
    expect(res.status).toBe(403)
  })
  it('rejects a missing/invalid query (400)', async () => {
    const res = await GET(req('subject=Maths'))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/integration/last-rate-api.test.ts` — Expected: FAIL (no route).

- [ ] **Step 3: Implement the last-rate routes**

`app/api/receipts/last-rate/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/profile'
import { lastRateFor } from '@/lib/repos/receipts'

const query = z.object({ student_id: z.string().uuid(), subject: z.string().trim().min(1) })

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return NextResponse.json({ success: false, error: 'no-access' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const parsed = query.safeParse({ student_id: url.searchParams.get('student_id'), subject: url.searchParams.get('subject') })
  if (!parsed.success) return NextResponse.json({ success: false, error: 'invalid' }, { status: 400 })

  const rate = await lastRateFor(parsed.data.student_id, parsed.data.subject)
  return NextResponse.json({ success: true, data: { rate } })
}
```

`app/api/payslips/last-rate/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/profile'
import { lastRateFor } from '@/lib/repos/payslips'

const query = z.object({ teacher_id: z.string().uuid(), label: z.string().trim().min(1) })

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return NextResponse.json({ success: false, error: 'no-access' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const parsed = query.safeParse({ teacher_id: url.searchParams.get('teacher_id'), label: url.searchParams.get('label') })
  if (!parsed.success) return NextResponse.json({ success: false, error: 'invalid' }, { status: 400 })

  const rate = await lastRateFor(parsed.data.teacher_id, parsed.data.label)
  return NextResponse.json({ success: true, data: { rate } })
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/integration/last-rate-api.test.ts` — Expected: PASS (admin rate/null; non-admin 403; invalid 400).

- [ ] **Step 5: Implement the issue receipt form (client, live total + prefill)** — `app/(app)/admin/finance/IssueReceiptForm.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney, lineAmount, computeTotals } from '@/lib/money'

type Line = { subject: string; hours: string; rate: string }
const empty = (): Line => ({ subject: '', hours: '', rate: '' })

export function IssueReceiptForm() {
  const router = useRouter()
  const [studentId, setStudentId] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [note, setNote] = useState('')
  const [discount, setDiscount] = useState('')
  const [lines, setLines] = useState<Line[]>([empty()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const numericLines = lines
    .filter((l) => l.subject && l.hours && l.rate)
    .map((l) => ({ hours: Number(l.hours), rate: Number(l.rate) }))
  const totals = numericLines.length
    ? computeTotals(numericLines, discount ? Number(discount) : null)
    : { subtotal: 0, total: 0 }

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  // Prefill the rate from the newest prior receipt line for this student+subject.
  const prefillRate = async (i: number, subject: string) => {
    if (!studentId || !subject) return
    const res = await fetch(`/api/receipts/last-rate?student_id=${studentId}&subject=${encodeURIComponent(subject)}`)
    const json = await res.json()
    if (json.success && json.data.rate != null && !lines[i].rate) setLine(i, { rate: String(json.data.rate) })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setBusy(true)
    try {
      const payload = {
        student_id: studentId, currency, note: note || undefined,
        discount: discount ? Number(discount) : null,
        lines: lines.filter((l) => l.subject && l.hours && l.rate)
          .map((l) => ({ subject: l.subject, hours: Number(l.hours), rate: Number(l.rate) })),
      }
      const res = await fetch('/api/receipts', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'failed')
      setStudentId(''); setNote(''); setDiscount(''); setLines([empty()])
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-medium">Issue receipt</h2>
      <input className="w-full rounded border p-2" placeholder="Student profile id (uuid)" value={studentId}
        onChange={(e) => setStudentId(e.target.value)} required />
      <div className="flex gap-2">
        <input className="w-24 rounded border p-2" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        <input className="flex-1 rounded border p-2" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input className="flex-1 rounded border p-2" placeholder="Subject" value={l.subject}
              onChange={(e) => setLine(i, { subject: e.target.value })} onBlur={(e) => prefillRate(i, e.target.value)} />
            <input className="w-24 rounded border p-2" placeholder="Hours" inputMode="decimal" value={l.hours}
              onChange={(e) => setLine(i, { hours: e.target.value })} />
            <input className="w-24 rounded border p-2" placeholder="Rate" inputMode="decimal" value={l.rate}
              onChange={(e) => setLine(i, { rate: e.target.value })} />
            <span className="w-28 self-center text-right text-sm text-slate-600">
              {l.hours && l.rate ? formatMoney(lineAmount(Number(l.hours), Number(l.rate)), currency) : '—'}
            </span>
          </div>
        ))}
        <button type="button" className="text-sm text-blue-600" onClick={() => setLines((p) => [...p, empty()])}>+ add line</button>
      </div>
      <input className="w-40 rounded border p-2" placeholder="Discount (optional)" inputMode="decimal" value={discount}
        onChange={(e) => setDiscount(e.target.value)} />
      <div className="flex justify-end gap-6 text-sm">
        <span>Subtotal: <strong>{formatMoney(totals.subtotal, currency)}</strong></span>
        <span>Total: <strong>{formatMoney(totals.total, currency)}</strong></span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-lg border px-4 py-2 font-medium shadow-sm disabled:opacity-50">
        {busy ? 'Issuing…' : 'Issue receipt'}
      </button>
    </form>
  )
}
```

- [ ] **Step 6: Implement the issue pay slip form** — `app/(app)/admin/finance/IssuePayslipForm.tsx`
(Mirror of the receipt form: `teacher_id`, lines `{label, hours, rate}`, no discount; live `total = Σ lineAmount`; prefill via `/api/payslips/last-rate?teacher_id=…&label=…`; POST to `/api/payslips`.)

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney, lineAmount } from '@/lib/money'

type Line = { label: string; hours: string; rate: string }
const empty = (): Line => ({ label: '', hours: '', rate: '' })

export function IssuePayslipForm() {
  const router = useRouter()
  const [teacherId, setTeacherId] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([empty()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const total = lines.filter((l) => l.hours && l.rate)
    .reduce((s, l) => s + lineAmount(Number(l.hours), Number(l.rate)), 0)

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const prefillRate = async (i: number, label: string) => {
    if (!teacherId || !label) return
    const res = await fetch(`/api/payslips/last-rate?teacher_id=${teacherId}&label=${encodeURIComponent(label)}`)
    const json = await res.json()
    if (json.success && json.data.rate != null && !lines[i].rate) setLine(i, { rate: String(json.data.rate) })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setBusy(true)
    try {
      const payload = {
        teacher_id: teacherId, currency, note: note || undefined,
        lines: lines.filter((l) => l.label && l.hours && l.rate)
          .map((l) => ({ label: l.label, hours: Number(l.hours), rate: Number(l.rate) })),
      }
      const res = await fetch('/api/payslips', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'failed')
      setTeacherId(''); setNote(''); setLines([empty()])
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-medium">Issue pay slip</h2>
      <input className="w-full rounded border p-2" placeholder="Teacher profile id (uuid)" value={teacherId}
        onChange={(e) => setTeacherId(e.target.value)} required />
      <div className="flex gap-2">
        <input className="w-24 rounded border p-2" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        <input className="flex-1 rounded border p-2" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input className="flex-1 rounded border p-2" placeholder="Label (subject · class)" value={l.label}
              onChange={(e) => setLine(i, { label: e.target.value })} onBlur={(e) => prefillRate(i, e.target.value)} />
            <input className="w-24 rounded border p-2" placeholder="Hours" inputMode="decimal" value={l.hours}
              onChange={(e) => setLine(i, { hours: e.target.value })} />
            <input className="w-24 rounded border p-2" placeholder="Rate" inputMode="decimal" value={l.rate}
              onChange={(e) => setLine(i, { rate: e.target.value })} />
            <span className="w-28 self-center text-right text-sm text-slate-600">
              {l.hours && l.rate ? formatMoney(lineAmount(Number(l.hours), Number(l.rate)), currency) : '—'}
            </span>
          </div>
        ))}
        <button type="button" className="text-sm text-blue-600" onClick={() => setLines((p) => [...p, empty()])}>+ add line</button>
      </div>
      <div className="flex justify-end text-sm">
        <span>Total: <strong>{formatMoney(total, currency)}</strong></span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-lg border px-4 py-2 font-medium shadow-sm disabled:opacity-50">
        {busy ? 'Issuing…' : 'Issue pay slip'}
      </button>
    </form>
  )
}
```

- [ ] **Step 7: Implement the admin finance page (server, admin-guarded, list + void)** — `app/(app)/admin/finance/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { listReceipts } from '@/lib/repos/receipts'
import { listPayslips } from '@/lib/repos/payslips'
import { formatMoney } from '@/lib/money'
import { IssueReceiptForm } from './IssueReceiptForm'
import { IssuePayslipForm } from './IssuePayslipForm'

export default async function AdminFinancePage() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.role !== 'admin') redirect('/dashboard')

  const [receipts, payslips] = await Promise.all([listReceipts(), listPayslips()])

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Finance</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <IssueReceiptForm />
        <IssuePayslipForm />
      </div>

      <section>
        <h2 className="font-medium">Receipts</h2>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th>Number</th><th>Student</th><th>Total</th><th></th><th></th></tr></thead>
          <tbody>
            {receipts.map((r) => (
              <tr key={r.id} className={`border-t ${r.voided ? 'text-slate-400 line-through' : ''}`}>
                <td className="py-1">{r.number}</td>
                <td>{r.student_name_snapshot}</td>
                <td>{formatMoney(Number(r.total), r.currency)}</td>
                <td><a className="text-blue-600 hover:underline" href={`/api/receipts/${r.id}/pdf`} target="_blank" rel="noreferrer">PDF</a></td>
                <td>{!r.voided && <form action={`/api/receipts/${r.id}/void`} method="post"><button className="text-red-600">Void</button></form>}</td>
              </tr>
            ))}
            {receipts.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-500">No receipts yet.</td></tr>}
          </tbody>
        </table>
        <a className="mt-2 inline-block text-sm text-blue-600" href="/api/receipts/export">Export CSV</a>
      </section>

      <section>
        <h2 className="font-medium">Pay slips</h2>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th>Number</th><th>Teacher</th><th>Total</th><th></th><th></th></tr></thead>
          <tbody>
            {payslips.map((p) => (
              <tr key={p.id} className={`border-t ${p.voided ? 'text-slate-400 line-through' : ''}`}>
                <td className="py-1">{p.number}</td>
                <td>{p.teacher_name_snapshot}</td>
                <td>{formatMoney(Number(p.total), p.currency)}</td>
                <td><a className="text-blue-600 hover:underline" href={`/api/payslips/${p.id}/pdf`} target="_blank" rel="noreferrer">PDF</a></td>
                <td>{!p.voided && <form action={`/api/payslips/${p.id}/void`} method="post"><button className="text-red-600">Void</button></form>}</td>
              </tr>
            ))}
            {payslips.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-500">No pay slips yet.</td></tr>}
          </tbody>
        </table>
        <a className="mt-2 inline-block text-sm text-blue-600" href="/api/payslips/export">Export CSV</a>
      </section>
    </main>
  )
}
```

> The inline `<form method="post">` Void buttons post to the void endpoints; the browser navigates and the page re-renders (the row shows struck-through/voided). For a richer UX a small client island can call `fetch` + `router.refresh()`, but the plain form keeps the pilot dependency-free.

- [ ] **Step 8: Implement the org_settings editor** — `app/(app)/admin/settings/actions.ts`

```ts
'use server'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'

/** Update the single org_settings row (admin only). Static receipt/payslip content lives here. */
export async function updateOrgSettings(formData: FormData) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active' || profile.role !== 'admin') throw new Error('forbidden')

  const fields = [
    'institute_name', 'contact_email', 'contact_phone',
    'bank_account', 'bank_ifsc', 'bank_branch', 'terms_text',
    'signatory_name', 'signatory_title', 'default_currency', 'timezone',
    'receipt_prefix', 'payslip_prefix',
  ] as const
  const update: Record<string, string> = {}
  for (const f of fields) {
    const v = formData.get(f)
    if (typeof v === 'string') update[f] = v
  }

  const admin = createAdminClient()
  const { error } = await admin.from('org_settings').update(update).eq('id', true)
  if (error) throw new Error(`updateOrgSettings: ${error.message}`)
  redirect('/admin/settings?saved=1')
}
```

`app/(app)/admin/settings/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { getOrgSettings } from '@/lib/repos/orgSettings'
import { updateOrgSettings } from './actions'

export default async function AdminSettingsPage() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.role !== 'admin') redirect('/dashboard')

  const org = await getOrgSettings()
  const Field = ({ name, label, value }: { name: string; label: string; value: string | null }) => (
    <label className="block text-sm">{label}
      <input name={name} defaultValue={value ?? ''} className="mt-1 w-full rounded border p-2" />
    </label>
  )

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Organization settings</h1>
      <form action={updateOrgSettings} className="space-y-3">
        <Field name="institute_name" label="Institute name" value={org.institute_name} />
        <Field name="contact_email" label="Contact email" value={org.contact_email} />
        <Field name="contact_phone" label="Contact phone" value={org.contact_phone} />
        <Field name="bank_account" label="Bank account" value={org.bank_account} />
        <Field name="bank_ifsc" label="IFSC" value={org.bank_ifsc} />
        <Field name="bank_branch" label="Branch" value={org.bank_branch} />
        <label className="block text-sm">Terms
          <textarea name="terms_text" defaultValue={org.terms_text ?? ''} className="mt-1 w-full rounded border p-2" />
        </label>
        <Field name="signatory_name" label="Signatory name" value={org.signatory_name} />
        <Field name="signatory_title" label="Signatory title" value={org.signatory_title} />
        <Field name="default_currency" label="Default currency" value={org.default_currency} />
        <Field name="timezone" label="Timezone" value={org.timezone} />
        <Field name="receipt_prefix" label="Receipt prefix" value={org.receipt_prefix} />
        <Field name="payslip_prefix" label="Pay slip prefix" value={org.payslip_prefix} />
        <button type="submit" className="rounded-lg border px-4 py-2 font-medium shadow-sm">Save</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 9: Typecheck + build** — Run: `npx tsc --noEmit` then `npm run build` — Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/admin/finance" "app/(app)/admin/settings" "app/api/receipts/last-rate" "app/api/payslips/last-rate" tests/integration/last-rate-api.test.ts
git commit -m "feat: admin finance UI (issue+void, live total, last-rate prefill) + org settings editor"
```

---

## Task 4.10: Student/teacher download pages + CSV export

> Spec §6: student `/receipts` (own + download), teacher `/payslips` (own + download); §7.5/§8: CSV export available to admin. RLS scopes the lists; downloads use the Task 4.8 endpoints.

**Files:**
- Create: `app/(app)/receipts/page.tsx`, `app/(app)/payslips/page.tsx`, `app/api/receipts/export/route.ts`, `app/api/payslips/export/route.ts`, `lib/finance/csv.ts`
- Test: `tests/unit/csv.test.ts`

- [ ] **Step 1: Write the failing CSV test**

```ts
// tests/unit/csv.test.ts
import { describe, it, expect } from 'vitest'
import { toCsv } from '@/lib/finance/csv'

describe('toCsv', () => {
  const rows = [
    { number: 'CEA-R-2026-0001', name: 'Aadhya', total: 2500, currency: 'INR', voided: false, issue_date: '2026-06-02' },
    { number: 'CEA-R-2026-0002', name: 'O\'Brien, Sam', total: 1000, currency: 'INR', voided: true, issue_date: '2026-06-03' },
  ]
  it('emits a header row + one row per record', () => {
    const csv = toCsv(rows)
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('number,name,total,currency,voided,issue_date')
  })
  it('quotes + escapes values containing commas or quotes', () => {
    const csv = toCsv(rows)
    expect(csv).toContain('"O\'Brien, Sam"') // comma -> quoted
  })
  it('renders booleans and numbers plainly', () => {
    const csv = toCsv(rows)
    expect(csv).toContain('CEA-R-2026-0001,Aadhya,2500,INR,false,2026-06-02')
  })
  it('returns just the header for an empty list', () => {
    expect(toCsv([])).toBe('number,name,total,currency,voided,issue_date\n')
  })
})
```

- [ ] **Step 2: Run — must fail** — Run: `npm run test -- tests/unit/csv.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement** — `lib/finance/csv.ts`

```ts
export type CsvRow = {
  number: string; name: string; total: number; currency: string; voided: boolean; issue_date: string
}

const COLS: (keyof CsvRow)[] = ['number', 'name', 'total', 'currency', 'voided', 'issue_date']

function cell(v: string | number | boolean): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Render finance rows as RFC-4180-ish CSV (header + rows). Always ends with a trailing newline. */
export function toCsv(rows: CsvRow[]): string {
  const header = COLS.join(',')
  const body = rows.map((r) => COLS.map((c) => cell(r[c])).join(',')).join('\n')
  return body ? `${header}\n${body}\n` : `${header}\n`
}
```

- [ ] **Step 4: Run — must pass** — Run: `npm run test -- tests/unit/csv.test.ts` — Expected: PASS (header+rows; escaping; empty → header only).

- [ ] **Step 5: Implement the export routes (admin-only)**

`app/api/receipts/export/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { listReceipts } from '@/lib/repos/receipts'
import { toCsv } from '@/lib/finance/csv'

export async function GET() {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return NextResponse.json({ success: false, error: 'no-access' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  const receipts = await listReceipts()
  const csv = toCsv(receipts.map((r) => ({
    number: r.number, name: r.student_name_snapshot, total: Number(r.total),
    currency: r.currency, voided: r.voided, issue_date: r.issue_date,
  })))
  return new NextResponse(csv, {
    headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="receipts.csv"' },
  })
}
```

`app/api/payslips/export/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'
import { listPayslips } from '@/lib/repos/payslips'
import { toCsv } from '@/lib/finance/csv'

export async function GET() {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return NextResponse.json({ success: false, error: 'no-access' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  const payslips = await listPayslips()
  const csv = toCsv(payslips.map((p) => ({
    number: p.number, name: p.teacher_name_snapshot, total: Number(p.total),
    currency: p.currency, voided: p.voided, issue_date: p.issue_date,
  })))
  return new NextResponse(csv, {
    headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="payslips.csv"' },
  })
}
```

- [ ] **Step 6: Implement the student receipts page** — `app/(app)/receipts/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { listReceipts } from '@/lib/repos/receipts'
import { formatMoney } from '@/lib/money'

export default async function ReceiptsPage() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  const receipts = await listReceipts() // RLS: students see only their own

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">My receipts</h1>
      <ul className="mt-6 space-y-3">
        {receipts.length === 0 && <li className="text-slate-500">No receipts yet.</li>}
        {receipts.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
            <div>
              <p className={`font-medium ${r.voided ? 'text-slate-400 line-through' : ''}`}>{r.number}</p>
              <p className="text-sm text-slate-500">{r.issue_date} · {formatMoney(Number(r.total), r.currency)}{r.voided ? ' · VOID' : ''}</p>
            </div>
            <a className="text-blue-600 hover:underline" href={`/api/receipts/${r.id}/pdf`} target="_blank" rel="noreferrer">Download</a>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 7: Implement the teacher payslips page** — `app/(app)/payslips/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'
import { listPayslips } from '@/lib/repos/payslips'
import { formatMoney } from '@/lib/money'

export default async function PayslipsPage() {
  const profile = await getProfile()
  if (!profile) redirect('/access-pending')
  if (profile.status === 'disabled') redirect('/access-revoked')
  if (profile.status !== 'active') redirect('/access-pending')

  const payslips = await listPayslips() // RLS: teachers see only their own

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">My pay slips</h1>
      <ul className="mt-6 space-y-3">
        {payslips.length === 0 && <li className="text-slate-500">No pay slips yet.</li>}
        {payslips.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
            <div>
              <p className={`font-medium ${p.voided ? 'text-slate-400 line-through' : ''}`}>{p.number}</p>
              <p className="text-sm text-slate-500">{p.issue_date} · {formatMoney(Number(p.total), p.currency)}{p.voided ? ' · VOID' : ''}</p>
            </div>
            <a className="text-blue-600 hover:underline" href={`/api/payslips/${p.id}/pdf`} target="_blank" rel="noreferrer">Download</a>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 8: Typecheck + build** — Run: `npx tsc --noEmit` then `npm run build` — Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/receipts" "app/(app)/payslips" "app/api/receipts/export" "app/api/payslips/export" lib/finance/csv.ts tests/unit/csv.test.ts
git commit -m "feat: student/teacher finance pages + admin CSV export"
```

---

## Task 4.11: Playwright E2E — issue → download → void → reissue

> Plan index Phase 4 E2E: "admin issues receipt → student downloads → void → reissue". Runs against a local dev server with the PREVIEW Supabase project (never prod). The PDF render uses the real Chromium path; assert the download returns a `%PDF` byte stream and the reissued receipt has a NEW number.

**Files:**
- Create: `e2e/finance.spec.ts`
- Modify: `package.json` (add `test:e2e` script if absent), `playwright.config.ts` (only if missing)

- [ ] **Step 1: Ensure Playwright is installed/configured** — reuse the Phase 3 `playwright.config.ts` if present; otherwise create it as in Phase 3 Task 3.7 Step 1.

- [ ] **Step 2: Write the E2E spec**

```ts
// e2e/finance.spec.ts
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Seeds run against the PREVIEW Supabase project via service-role (E2E_* envs).
const sb = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!)

let studentId = ''

// Per-role auth via storageState files from the Phase 0/1 E2E login setup:
//   e2e/.auth/admin.json, e2e/.auth/student.json

test.beforeAll(async () => {
  const student = (await sb.from('profiles').select('id').eq('email', process.env.E2E_STUDENT_EMAIL!).single()).data!
  studentId = student.id
})

test.afterAll(async () => {
  // remove receipts created by this run for the seeded student (lines cascade)
  await sb.from('receipts').delete().eq('student_id', studentId).like('note', 'E2E%')
})

test('admin issues a receipt → student downloads it → admin voids → reissues a new number', async ({ browser }) => {
  // 1) Admin issues a receipt for the enrolled student.
  const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
  const aPage = await admin.newPage()
  await aPage.goto('/admin/finance')
  await aPage.getByPlaceholder('Student profile id (uuid)').first().fill(studentId)
  await aPage.locator('input[placeholder="Subject"]').first().fill('Maths')
  await aPage.locator('input[placeholder="Hours"]').first().fill('5')
  await aPage.locator('input[placeholder="Rate"]').first().fill('200')
  await aPage.locator('input[placeholder="Note (optional)"]').first().fill('E2E run 1')
  await aPage.getByRole('button', { name: /Issue receipt/ }).click()

  // The new receipt row appears; capture its number.
  const firstNumber = (await sb.from('receipts').select('number').eq('student_id', studentId)
    .order('created_at', { ascending: false }).limit(1).single()).data!.number
  await expect(aPage.getByText(firstNumber)).toBeVisible({ timeout: 30_000 })

  const receiptId = (await sb.from('receipts').select('id').eq('number', firstNumber).single()).data!.id

  // 2) Student downloads their receipt PDF.
  const student = await browser.newContext({ storageState: 'e2e/.auth/student.json' })
  const sPage = await student.newPage()
  await sPage.goto('/receipts')
  await expect(sPage.getByText(firstNumber)).toBeVisible()
  const resp = await sPage.request.get(`/api/receipts/${receiptId}/pdf`)
  expect(resp.status()).toBe(200)
  expect(resp.headers()['content-type']).toContain('application/pdf')
  const buf = await resp.body()
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')

  // 3) Admin voids the receipt (number preserved).
  await aPage.goto('/admin/finance')
  await aPage.locator(`tr:has-text("${firstNumber}") button:has-text("Void")`).click()
  await expect(aPage.locator(`tr:has-text("${firstNumber}").line-through, tr:has-text("${firstNumber}") .line-through`)).toBeVisible({ timeout: 15_000 })
  const voided = (await sb.from('receipts').select('voided,number').eq('id', receiptId).single()).data!
  expect(voided.voided).toBe(true)
  expect(voided.number).toBe(firstNumber) // number kept on void

  // 4) Admin reissues a corrected receipt -> a NEW number.
  await aPage.getByPlaceholder('Student profile id (uuid)').first().fill(studentId)
  await aPage.locator('input[placeholder="Subject"]').first().fill('Maths')
  await aPage.locator('input[placeholder="Hours"]').first().fill('6') // corrected hours
  await aPage.locator('input[placeholder="Rate"]').first().fill('200')
  await aPage.locator('input[placeholder="Note (optional)"]').first().fill('E2E run 2 (reissue)')
  await aPage.getByRole('button', { name: /Issue receipt/ }).click()

  const secondNumber = (await sb.from('receipts').select('number').eq('student_id', studentId)
    .order('created_at', { ascending: false }).limit(1).single()).data!.number
  expect(secondNumber).not.toBe(firstNumber) // reissue allocated a fresh number
  await expect(aPage.getByText(secondNumber)).toBeVisible({ timeout: 30_000 })

  await admin.close(); await student.close()
})
```

- [ ] **Step 3: Run the E2E suite**

Run: `npm run test:e2e -- e2e/finance.spec.ts`
Expected: PASS — admin issues `CEA-R-…-NNNN`; student downloads a `%PDF` stream; void preserves the number + strikes the row; reissue produces a strictly different number.

> If the local environment cannot launch Chromium for the server-side PDF render, set `PUPPETEER_EXECUTABLE_PATH` for the dev server (e.g. to a system Chrome) so the issue endpoint can generate the PDF during the E2E run.

- [ ] **Step 4: Commit**

```bash
git add e2e/finance.spec.ts package.json
git commit -m "test: e2e finance — issue → download → void → reissue (new number)"
```

---

## Phase 4 Acceptance Criteria
- [ ] `npm run test` green: `money` (INR + GCC formatting, line/total math, discount rules), receipt/payslip Zod validators, `receiptTemplate`/`payslipTemplate` (fields/lines/total present, Discount conditional, paid/due/due-date omitted, brand assets embedded, pay slip has no student/class), `issueReceipt` orchestration (mocked), receipts-API guard/envelope, void-API, receipt-pdf access check, last-rate API, `csv`.
- [ ] Integration (env-file runner) green: `rls-finance` (anon blocked on receipts + payslips; `due_date` column absent; `next_document_number` monotonic), `documentCounters` (sequential + 25-way concurrent uniqueness, per-type sequences), `lastRate` (newest rate wins; null when none).
- [ ] The five tables (`receipts`, `receipt_lines`, `payslips`, `payslip_lines`, `document_counters`) exist with **RLS enabled**: students read only their own receipts; teachers read only their own pay slips; admin reads all; all writes are admin-only. Receipts have `subtotal`/`discount` (nullable)/`total` and **no** paid/due/due_date.
- [ ] Admin issues a numbered receipt/pay slip: totals computed (`total = subtotal − discount`), a concurrency-safe sequential `number` allocated, the Option B PDF rendered (brand fonts + logo embedded) and uploaded server→Drive `Cert-Ed Academia/Finance/Receipts|Pay Slips/`, the record + lines inserted, and an `audit_log` row written. Teacher/student attempts to issue are 403.
- [ ] Student/teacher download **only their own** PDF via the access-checked endpoint (re-streamed from Drive); a non-owner read is 404 (RLS) and a signed-out request is 401.
- [ ] Void marks `voided=true`, **keeps the number**, and audits; a corrected reissue is a fresh POST that allocates a **new** number (E2E proves first ≠ second).
- [ ] Admin CSV export returns `text/csv` with header + one row per record (escaped); last-used-rate prefill returns the newest matching line's rate (or null).
- [ ] Playwright E2E green: issue → student download (`%PDF`) → void (number kept, row struck) → reissue (new number).
- [ ] All API inputs validated with Zod; all responses use the `{ success, data?, error? }` envelope; no secrets in the client bundle (service-role + Drive token used only in server `lib/finance/*`, `lib/repos/*`, `lib/pdf/*`, and route handlers).
- [ ] Committed in small steps with conventional-commit messages.

## Self-review notes (done)
- **Spec coverage:** §3 PDF row + §4.5 PDF generation → Task 4.4 (`renderPdf` Chromium engine, Option B templates with embedded brand fonts + logo); §5 finance tables (exact columns: receipts `subtotal`/`discount` nullable/`total`, **no** paid/due/due_date; `receipt_lines`/`payslips`/`payslip_lines`/`document_counters`) → Task 4.1 migration; §7.5 generate flow (validate → computeTotals → allocate number → render → Drive → insert + audit) → Tasks 4.2/4.3/4.6; void+reissue immutability → Task 4.7; last-used-rate prefill (newest line for party+subject) → Task 4.5; student/teacher download own + admin CSV → Tasks 4.8/4.10; org_settings as the single source of all static content → Task 4.9.
- **The OMIT rules are enforced and tested:** receipt/pay slip templates render no PAID/DUE badge and no Due row; the migration has no `due_date`/paid columns; an integration test asserts the `due_date` column does not exist. The Discount row is conditional (only when `discount > 0`); `total = subtotal − discount` is unit-tested including the no-/zero-discount path.
- **Numbering is genuinely concurrency-safe:** allocation is a single SQL `INSERT … ON CONFLICT DO UPDATE … RETURNING` (`next_document_number`), so concurrent callers serialize on the PK row lock; a 25-way `Promise.all` integration test asserts 25 unique, contiguous numbers, and per-`doc_type` sequences are independent. `receiptNumber` (Phase 0) formats both receipts and pay slips (prefix differs only).
- **Authorization defense-in-depth:** RLS at the DB (students/teachers read own; admin all; writes admin-only) PLUS explicit `getProfile()` + admin role checks at every issue/void/export/prefill route; downloads rely on the RLS-scoped `getReceipt`/`getPayslip` read as the access check before streaming Drive bytes, so a non-owner gets 404. Service-role + Drive token are confined to `server-only` modules.
- **Templates are true siblings:** `head()`/`header()`/`footer()` (and the receipt's `totals()`) are shared helpers; the pay slip drops the student/class block and the discount logic, keeping header/footer identical — matching spec §7.5 ("Pay slip is the sibling … no student/class").
- **Type consistency:** `DocType`, `ReceiptRow`/`ReceiptLineRow`/`NewReceipt`, `PayslipRow`/`NewPayslip`, `ReceiptView`/`PayslipView`, `IssueReceiptInput`/`IssuePayslipInput`, `Totals`, `CsvRow` each defined once and imported; `AuditAction` extended (not redefined) with the four finance actions; the `{ success, data?, error? }` envelope matches Phases 0–3.
- **Reuse:** `getOrgSettings`/`receiptNumber` (Phase 0 `lib/repos/orgSettings`), `getDriveClient`/`ensureFolderPath` (Phase 0 `lib/drive/*`), `writeAudit` + `audit_log` (Phase 1 `lib/audit`), `createClient`/`createAdminClient` (Phase 0 `lib/supabase/*`), `getProfile`/`assertRole` (Phase 0 `lib/auth/*`) consumed unchanged. New deps `puppeteer-core` + `@sparticuz/chromium` are isolated in `lib/pdf/renderPdf.ts`.
- **No placeholders:** every step has runnable code, an explicit run command, and an expected RED/GREEN outcome; the Chromium smoke + E2E note the `PUPPETEER_EXECUTABLE_PATH` fallback for local runs; commit messages are conventional and attribution-free.
- **Cross-phase assumptions recorded:** (1) Phase 1 `lib/audit.ts` exposes `writeAudit(admin, { actor_id, action, entity_type, entity_id })` and an `AuditAction` union this phase extends; the `audit_log` table + its admin-only policy exist. (2) Phase 0 `org_settings` already holds `receipt_prefix`/`payslip_prefix`/`default_currency`/bank/signatory/terms, and `lib/drive/folders.ts` exposes `ensureFolderPath(drive, rootId, segments)` and `getDriveClient()`. (3) Phase 0/1 E2E setup produces per-role `e2e/.auth/{admin,student}.json` storage states and `E2E_*` envs (preview Supabase). (4) The institute Drive owner account + `GOOGLE_DRIVE_ROOT_FOLDER_ID` (or `root`) are configured so `Finance/Receipts|Pay Slips/` can be created. If any differ, only the noted call sites change — the test contracts stay fixed.
