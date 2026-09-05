import 'server-only'
import { createHash } from 'node:crypto'
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

/**
 * Short digest of exactly the org_settings fields that get BAKED INTO a rendered
 * document, for the PDF cache validator.
 *
 * The ETag used to encode only the document id and its void flag, on the reasoning that
 * an issued document is immutable. But the letterhead is not part of the document record -
 * it is read from org_settings at render time - so correcting a bank account or signatory
 * left every already-fetched PDF revalidating to a 304 and showing the OLD details
 * indefinitely (and, for a voided document, `immutable` meant not even revalidating for a
 * year). Folding this digest into the ETag makes the letterhead part of the cache key.
 *
 * Derived from orgInfo() itself, so a field added to the letterhead is covered
 * automatically rather than needing to be remembered here.
 */
export async function letterheadDigest(): Promise<string> {
  const info = orgInfo(await getOrgSettings())
  return createHash('sha1').update(JSON.stringify(info)).digest('hex').slice(0, 12)
}

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

type FinanceDoc = NonNullable<Awaited<ReturnType<typeof getDoc>>>

/**
 * Authorize + fetch the document META only - the cheap half, no headless
 * Chromium. Returns null if the caller isn't the owner or a finance viewer, so a
 * bare `/api/{kind}s/[id]/pdf` request for someone else's receipt/pay slip
 * returns 404 (the check is explicit in code, never RLS alone), matching the
 * assignment-review pattern.
 *
 * Authorization is keyed on viewFinance (the same capability that gates the
 * /admin/finance ledger and the CSV export), NOT the admin persona alone - so a
 * user granted viewFinance by override can open the per-row PDF for any row they
 * can already see, and the three finance surfaces stay in step. The party may
 * always fetch their own document.
 *
 * Splitting this out lets the route compute a cache validator and answer a
 * conditional request (304) WITHOUT paying for the render - the caller must still
 * run this authorization before trusting an If-None-Match, so a 304 is only ever
 * returned to someone who is allowed to see the document.
 */
export async function resolveDocForViewer(
  kind: FinanceKind,
  id: string,
  viewer: { id: string; role?: string },
): Promise<FinanceDoc | null> {
  const { actorHasCapability } = await import('@/lib/services/authorization')
  const doc = await getDoc(kind, id)
  if (!doc) return null
  const canViewFinance = await actorHasCapability(viewer.id, 'viewFinance')
  if (!canViewFinance && doc.party_id !== viewer.id) return null
  return doc
}

/** Render an ALREADY-authorized document (from resolveDocForViewer) to PDF bytes
 *  - the expensive half (line items + org settings + template + headless
 *  Chromium). Never call this without resolving/authorizing first. */
export async function renderResolvedDocPdf(kind: FinanceKind, doc: FinanceDoc): Promise<Buffer> {
  const [lines, org] = await Promise.all([getDocLines(kind, doc.id), getOrgSettings()])
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
  return htmlToPdf(html)
}

/** Compose: resolve (authorize + meta) then render. Retained for callers that
 *  just want the bytes and don't need the meta for cache validation. */
export async function renderDocPdf(
  kind: FinanceKind,
  id: string,
  viewer: { id: string; role?: string },
): Promise<{ pdf: Buffer; number: string; voided: boolean } | null> {
  const doc = await resolveDocForViewer(kind, id, viewer)
  if (!doc) return null
  return { pdf: await renderResolvedDocPdf(kind, doc), number: doc.number, voided: doc.voided }
}
