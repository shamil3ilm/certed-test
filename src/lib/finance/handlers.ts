import 'server-only'
import { TOO_MANY_REQUESTS_MESSAGE } from '@/lib/api/messages'
import {
  ok,
  fail,
  authFail,
  forbiddenText,
  invalidInput,
  notFoundText,
  textFail,
  tooManyRequests,
} from '@/lib/api/response'
import { requireCapabilityApi, requireRoleApi } from '@/lib/auth/require-role'
import { ValidationError } from '@/lib/errors'
import { issueDocFromApiInput } from '@/lib/finance/issue'
import { renderDocPdf } from '@/lib/finance/render'
import { validateFinanceDocId, voidDoc, listAllDocs, type FinanceKind } from '@/lib/services/finance/finance-docs'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { rateLimit } from '@/lib/security/rate-limit'

/**
 * Shared route-handler factories for the two finance kinds. Each `/api/receipts`
 * and `/api/payslips` route file is a one-line export of one of these bound to
 * its kind, so the request/auth/response boilerplate lives in exactly one place.
 */

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

/** POST /api/{kind}s/[id]/void - void a document (STRUCTURAL admin-only; see note above). */
export function voidHandler(kind: FinanceKind) {
  return async function POST(_req: Request, ctx: { params: { id: string } }) {
    let me
    try {
      me = await requireRoleApi(['admin'])
    } catch (e) {
      return authFail(e)
    }
    const rl = rateLimit(`finance-void:${me.id}`, { limit: 30, windowMs: 60 * 1000 })
    if (!rl.ok) return tooManyRequests(TOO_MANY_REQUESTS_MESSAGE, rl.retryAfterSec)
    try {
      const id = validateFinanceDocId(ctx.params.id)
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

/** GET /api/{kind}s/[id]/pdf - render on demand. Access is OWNERSHIP-based, not
 *  role-based: renderDocPdf returns the document only to an admin or its own party
 *  (party_id === viewer.id). The role list here is just a coarse "authenticated,
 *  non-anonymous" pre-filter run before the expensive render - it includes mentor
 *  only because a mentor is staff who may hold their own payslip. The party
 *  ownership check inside renderDocPdf is the actual boundary. */
export function pdfHandler(kind: FinanceKind) {
  return async function GET(_req: Request, ctx: { params: { id: string } }) {
    let me
    try {
      me = await requireRoleApi(['admin', 'tutor', 'mentor', 'student'])
    } catch {
      return forbiddenText()
    }
    // Each render spins up headless Chromium - throttle per user to deter casual
    // bursts (per-instance; not a hard distributed cap).
    const rl = rateLimit(`pdf:${me.id}`, { limit: 20, windowMs: 60 * 1000 })
    if (!rl.ok) return tooManyRequests(TOO_MANY_REQUESTS_MESSAGE, rl.retryAfterSec)
    let out
    try {
      out = await renderDocPdf(kind, validateFinanceDocId(ctx.params.id), { id: me.id, role: me.role })
    } catch (e) {
      if (e instanceof ValidationError) return notFoundText()
      return textFail('Could not generate the document. Please try again in a moment.', 502)
    }
    if (!out) return notFoundText()
    return new Response(new Uint8Array(out.pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${out.number}.pdf"`,
        'Cache-Control': 'private, no-store',
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
    } catch {
      return forbiddenText()
    }
    const rl = rateLimit(`finance-export:${me.id}`, { limit: 10, windowMs: 60 * 1000 })
    if (!rl.ok) return tooManyRequests(TOO_MANY_REQUESTS_MESSAGE, rl.retryAfterSec)
    const rows = await listAllDocs(kind)
    const isReceipt = kind === 'receipt'
    const party = isReceipt ? 'student' : 'tutor'
    const header = isReceipt
      ? ['number', party, 'class', 'issue_date', 'currency', 'subtotal', 'discount', 'total', 'voided']
      : ['number', party, 'issue_date', 'currency', 'subtotal', 'discount', 'total', 'voided']
    const body = rows.map((r) => {
      const cols: (string | number | boolean)[] = [r.number, csv(r.party_name)]
      if (isReceipt) cols.push(csv(r.class_level ?? ''))
      cols.push(r.issue_date, r.currency, r.subtotal, r.discount ?? '', r.total, r.voided)
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
