import 'server-only'
import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { issueDocSchema } from '@/lib/validation/finance'
import { issueDoc } from '@/lib/finance/issue'
import { renderDocPdf } from '@/lib/finance/render'
import { voidDoc, listAllDocs, type FinanceKind } from '@/lib/repos/financeDocs'
import { writeAudit } from '@/lib/repos/audit'

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

/** POST /api/{kind}s — issue a document (admin only). */
export function issueHandler(kind: FinanceKind) {
  return async function POST(req: Request) {
    let me
    try {
      me = await requireRoleApi(['admin'])
    } catch (e) {
      return authFail(e)
    }
    const parsed = issueDocSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail('invalid input', 422)
    try {
      return ok(await issueDoc(kind, parsed.data, me.id))
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'issue failed', 500)
    }
  }
}

/** POST /api/{kind}s/[id]/void — void a document (admin only). */
export function voidHandler(kind: FinanceKind) {
  return async function POST(_req: Request, ctx: { params: { id: string } }) {
    let me
    try {
      me = await requireRoleApi(['admin'])
    } catch (e) {
      return authFail(e)
    }
    await voidDoc(kind, ctx.params.id)
    await writeAudit({ actor_id: me.id, action: `${kind}.void`, entity_type: kind, entity_id: ctx.params.id })
    return ok({ voided: true })
  }
}

/** GET /api/{kind}s/[id]/pdf — render on demand; RLS-scoped inside renderDocPdf. */
export function pdfHandler(kind: FinanceKind) {
  return async function GET(_req: Request, ctx: { params: { id: string } }) {
    let me
    try {
      me = await requireRoleApi(['admin', 'teacher', 'student'])
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
    const out = await renderDocPdf(kind, ctx.params.id, { id: me.id, role: me.role })
    if (!out) return new Response('Not found', { status: 404 })
    return new Response(new Uint8Array(out.pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${out.number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }
}

/** GET /api/{kind}s/export — CSV of all documents (admin only). */
export function exportHandler(kind: FinanceKind) {
  return async function GET() {
    try {
      await requireRoleApi(['admin'])
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
    const rows = await listAllDocs(kind)
    const isReceipt = kind === 'receipt'
    const party = isReceipt ? 'student' : 'teacher'
    const header = isReceipt
      ? ['number', party, 'class', 'issue_date', 'currency', 'subtotal', 'discount', 'total', 'voided']
      : ['number', party, 'issue_date', 'currency', 'subtotal', 'discount', 'total', 'voided']
    const body = rows.map((r) => {
      const cols: (string | number | boolean)[] = [r.number, csv(r.party_name)]
      if (isReceipt) cols.push(r.class_level ?? '')
      cols.push(r.issue_date, r.currency, r.subtotal, r.discount ?? '', r.total, r.voided)
      return cols.join(',')
    })
    return new Response([header.join(','), ...body].join('\n'), {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${kind}s.csv"` },
    })
  }
}
