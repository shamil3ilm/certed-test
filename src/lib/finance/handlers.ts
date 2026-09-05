import 'server-only'
import { TOO_MANY_REQUESTS_MESSAGE } from '@/lib/api/messages'
import {
  ok,
  fail,
  authFail,
  authTextFail,
  invalidInput,
  notFoundText,
  textFail,
  tooManyRequests,
} from '@/lib/api/response'
import { requireActiveProfileApi, requireCapabilityApi, requireRoleApi } from '@/lib/auth/require-role'
import { ValidationError } from '@/lib/errors'
import { issueDocFromApiInput } from '@/lib/finance/issue'
import { buildBillingDraft } from '@/lib/services/finance/hours-billing'
import { resolveDocForViewer, renderResolvedDocPdf } from '@/lib/finance/render'
import { validateFinanceDocId, voidDoc, listAllDocs, type FinanceKind } from '@/lib/services/finance/finance-docs'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { rateLimit } from '@/lib/security/rate-limit'

/**
 * Shared route-handler factories for the two finance kinds. Each `/api/receipts`
 * and `/api/payslips` route file is a one-line export of one of these bound to
 * its kind, so the request/auth/response boilerplate lives in exactly one place.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Escape a CSV field, neutralizing spreadsheet formula injection first: a field
 *  starting with = + - @ (or a control char) is executed by Excel/Sheets, so a
 *  self-set display name like `=HYPERLINK(...)` must be prefixed with a quote. */
function csv(s: string): string {
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

// STRUCTURAL admin-only exception (deliberate, not override-grantable): issuing
// and voiding financial documents creates/reverses money records. viewFinance is
// a READ capability - it never confers finance WRITE - so these stay persona-locked
// to admin via requireRoleApi, mirroring the class-lifecycle rule in classroom/
// class-actions.ts. The read paths (export/pdf) are capability/role gated below.

/** POST /api/{kind}s - issue a document (STRUCTURAL admin-only; see note above). */
export function issueHandler(kind: FinanceKind) {
  return async function POST(req: Request) {
    let me
    try {
      me = await requireRoleApi(['admin'])
    } catch (e) {
      return authFail(e)
    }
    const rl = rateLimit(`finance-issue:${me.id}`, { limit: 30, windowMs: 60 * 1000 })
    if (!rl.ok) return tooManyRequests(TOO_MANY_REQUESTS_MESSAGE, rl.retryAfterSec)
    try {
      return ok(await issueDocFromApiInput(kind, await req.json().catch(() => null), me.id))
    } catch (e) {
      if (e instanceof ValidationError) return invalidInput(e.message)
      // Don't surface the raw Postgres/repo error text to the client - it leaks
      // internal schema/constraint detail even to an admin.
      return fail('Could not issue the document. Please check the details and try again.', 500)
    }
  }
}

/**
 * GET /api/{kind}s/draft?party=<uuid>&month=YYYY-MM - the hours-derived DRAFT for one
 * party and month: the class lines, their hours at that person's stored rate, and any
 * warning worth reading before issuing. It writes NOTHING.
 *
 * Admin-only like issuing, not viewFinance: the response carries a person's hourly rate,
 * which is admin-tier data (0094), and this is the pre-step of an admin-only action.
 */
export function draftHandler(kind: FinanceKind) {
  return async function GET(req: Request) {
    let me
    try {
      me = await requireRoleApi(['admin'])
    } catch (e) {
      return authFail(e)
    }
    const rl = rateLimit(`finance-draft:${me.id}`, { limit: 60, windowMs: 60 * 1000 })
    if (!rl.ok) return tooManyRequests(TOO_MANY_REQUESTS_MESSAGE, rl.retryAfterSec)

    const url = new URL(req.url)
    const party = url.searchParams.get('party') ?? ''
    const month = url.searchParams.get('month') ?? ''
    if (!UUID_RE.test(party)) return invalidInput('Select a valid party.')
    if (!MONTH_RE.test(month)) return invalidInput('Choose a month in YYYY-MM form.')

    try {
      return ok(await buildBillingDraft(kind, party, month))
    } catch {
      // Same rule as the issue handler: never hand the client raw repo/Postgres text.
      return fail('Could not build the draft. Please try again in a moment.', 500)
    }
  }
}

/** POST /api/{kind}s/[id]/void - void a document (STRUCTURAL admin-only; see note above). */
export function voidHandler(kind: FinanceKind) {
  return async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    let me
    try {
      me = await requireRoleApi(['admin'])
    } catch (e) {
      return authFail(e)
    }
    const rl = rateLimit(`finance-void:${me.id}`, { limit: 30, windowMs: 60 * 1000 })
    if (!rl.ok) return tooManyRequests(TOO_MANY_REQUESTS_MESSAGE, rl.retryAfterSec)
    try {
      const id = validateFinanceDocId((await ctx.params).id)
      const voided = await voidDoc(me.id, kind, id)
      if (!voided) return fail('Document not found or already voided.', 404)
      await auditPrivilegedAction(me, `${kind}.void`, kind, id)
      return ok({ voided: true })
    } catch (e) {
      if (e instanceof ValidationError) return invalidInput(e.message)
      return fail('Could not void the document. Please try again.', 500)
    }
  }
}

/** GET /api/{kind}s/[id]/pdf - render on demand. renderDocPdf returns the
 *  document to a viewFinance holder (the capability that gates the ledger + CSV
 *  export, admin by default and override-grantable) OR to its own party
 *  (party_id === viewer.id). The transport guard is therefore "active signed-in
 *  user", not a fixed persona list, so capability overrides are honoured by the
 *  authorization check rather than blocked ahead of it. */
export function pdfHandler(kind: FinanceKind) {
  return async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
    let me
    try {
      me = await requireActiveProfileApi()
    } catch (e) {
      return authTextFail(e)
    }
    // Authorize + fetch meta FIRST (cheap) - never render before this, so a 304
    // below is only ever answered to a viewer allowed to see the document.
    let doc
    try {
      doc = await resolveDocForViewer(kind, validateFinanceDocId((await ctx.params).id), { id: me.id, role: me.role })
    } catch (e) {
      if (e instanceof ValidationError) return notFoundText()
      return textFail('Could not generate the document. Please try again in a moment.', 502)
    }
    if (!doc) return notFoundText()

    // An issued finance document is immutable except for one one-way change: being
    // voided (which stamps a VOID badge). So the rendered bytes change only when
    // `voided` flips - that's the whole cache validator. A voided doc is terminal
    // (cache immutable); a live doc revalidates every request but the ETag lets us
    // answer 304 WITHOUT re-rendering, and a void flips the ETag so the next fetch
    // re-renders exactly once. `private`: per-user authorized document, never a
    // shared/CDN cache.
    const etag = `"${kind}-${doc.id}-${doc.voided ? 'void' : 'live'}"`
    const cacheControl = doc.voided ? 'private, max-age=31536000, immutable' : 'private, no-cache'
    if (req.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } })
    }

    // Only an actual render is worth throttling - a 304 above costs no Chromium, so
    // cache revalidations don't burn the per-user render budget.
    const rl = rateLimit(`pdf:${me.id}`, { limit: 20, windowMs: 60 * 1000 })
    if (!rl.ok) return tooManyRequests(TOO_MANY_REQUESTS_MESSAGE, rl.retryAfterSec)

    let pdf
    try {
      pdf = await renderResolvedDocPdf(kind, doc)
    } catch {
      return textFail('Could not generate the document. Please try again in a moment.', 502)
    }
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${doc.number}.pdf"`,
        'Cache-Control': cacheControl,
        ETag: etag,
      },
    })
  }
}

/** GET /api/{kind}s/export - CSV of all documents. Override-aware READ: viewFinance
 *  (admin by default) gates this and the /admin/finance page alike, so an override
 *  that opens the page also opens its export - no UI/API divergence. */
export function exportHandler(kind: FinanceKind) {
  return async function GET() {
    let me
    try {
      me = await requireCapabilityApi('viewFinance')
    } catch (e) {
      return authTextFail(e)
    }
    const rl = rateLimit(`finance-export:${me.id}`, { limit: 10, windowMs: 60 * 1000 })
    if (!rl.ok) return tooManyRequests(TOO_MANY_REQUESTS_MESSAGE, rl.retryAfterSec)
    let rows
    try {
      rows = await listAllDocs(kind)
    } catch {
      // Match the issue/void/pdf handlers: a query error returns a clean message,
      // never a bare unhandled 500 with internal detail.
      return fail('Could not export the documents. Please try again in a moment.', 500)
    }
    const isReceipt = kind === 'receipt'
    const party = isReceipt ? 'student' : 'tutor'
    const header = isReceipt
      ? ['number', party, 'class', 'issue_date', 'currency', 'subtotal', 'discount', 'total', 'voided']
      : ['number', party, 'issue_date', 'currency', 'subtotal', 'discount', 'total', 'voided']
    const body = rows.map((r) => {
      // Run EVERY string cell through csv() - not just the human-entered
      // party/class names. number/issue_date/currency are system-generated today,
      // but escaping them uniformly is cheap and removes any assumption that a
      // future format change can't introduce a leading =/+/-/@ (formula injection)
      // or a comma/quote/newline into those columns.
      const cols: (string | number | boolean)[] = [csv(r.number), csv(r.party_name)]
      if (isReceipt) cols.push(csv(r.class_level ?? ''))
      cols.push(csv(r.issue_date), csv(r.currency), r.subtotal, r.discount ?? '', r.total, r.voided)
      return cols.join(',')
    })
    await auditPrivilegedAction(me, `${kind}.export`, kind, null)
    return new Response([header.join(','), ...body].join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${kind}s.csv"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }
}
