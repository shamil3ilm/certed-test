import 'server-only'
import { getOrgSettings, type OrgSettings } from '@/lib/services/finance/org-settings'
import { buildReceiptHtml, buildPayslipHtml, type OrgInfo } from '@/lib/pdf/template'
import { brandAssets } from '@/lib/pdf/brand-assets'
import { htmlToPdf } from '@/lib/pdf/render-pdf'
import { formatDate } from '@/lib/time/format'
import { getDoc, getDocLines, type FinanceKind } from '@/lib/services/finance/finance-docs'

/**
 * Finance PDFs are generated on demand (printed when downloaded) and never
 * stored - the DB record + line items are the source of truth, so the document
 * is always reproducible and there's nothing to keep in sync.
 */

function orgInfo(org: OrgSettings): OrgInfo {
  return {
    instituteName: org.institute_name,
    email: org.contact_email,
    phone: org.contact_phone,
    bankAccount: org.bank_account,
    bankIfsc: org.bank_ifsc,
    bankBranch: org.bank_branch,
    terms: org.terms_text,
    signatoryName: org.signatory_name,
    signatoryTitle: org.signatory_title,
    signatureText: org.signature_text ?? 'Digitally signed by',
  }
}

/**
 * Render a finance document to PDF bytes. Returns null if the caller isn't the
 * owner or a finance viewer. The check is explicit (in code) so access never
 * depends on RLS alone - a bare `/api/{kind}s/[id]/pdf` request for someone
 * else's receipt/pay slip returns 404, matching the assignment-review pattern.
 *
 * Authorization is keyed on viewFinance (the same capability that gates the
 * /admin/finance ledger and the CSV export), NOT the admin persona alone - so a
 * user granted viewFinance by override can open the per-row PDF for any row they
 * can already see, and the three finance surfaces stay in step. The party may
 * always fetch their own document.
 */
export async function renderDocPdf(
  kind: FinanceKind,
  id: string,
  viewer: { id: string; role?: string },
): Promise<{ pdf: Buffer; number: string; voided: boolean } | null> {
  const { actorHasCapability } = await import('@/lib/services/authorization')
  const doc = await getDoc(kind, id)
  if (!doc) return null
  const canViewFinance = await actorHasCapability(viewer.id, 'viewFinance')
  if (!canViewFinance && doc.party_id !== viewer.id) return null
  const [lines, org] = await Promise.all([getDocLines(kind, id), getOrgSettings()])
  const build = kind === 'receipt' ? buildReceiptHtml : buildPayslipHtml
  const html = build(
    {
      number: doc.number,
      issueDate: formatDate(doc.issue_date),
      partyName: doc.party_name,
      classLevel: doc.class_level,
      currency: doc.currency,
      lines,
      subtotal: doc.subtotal,
      discount: doc.discount,
      total: doc.total,
      note: doc.note,
      voided: doc.voided,
    },
    orgInfo(org),
    brandAssets(),
  )
  return { pdf: await htmlToPdf(html), number: doc.number, voided: doc.voided }
}
