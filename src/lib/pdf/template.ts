import { formatMoney } from '@/lib/money'

export type DocLine = { label: string; hours: number; rate: number; amount: number }

export type FinanceDoc = {
  number: string
  issueDate: string
  partyName: string
  classLevel?: string | null
  currency: string
  lines: DocLine[]
  subtotal: number
  discount?: number | null
  total: number
  note?: string | null
  voided?: boolean
}

export type OrgInfo = {
  instituteName: string
  email?: string | null
  phone?: string | null
  bankAccount?: string | null
  bankIfsc?: string | null
  bankBranch?: string | null
  terms?: string | null
  signatoryName?: string | null
  signatoryTitle?: string | null
  signatureText?: string | null
}

export type BrandAssets = { louisGeorge: string; daggerSquare: string; logo: string }

// Match the on-screen brand tokens (globals.css --primary / --secondary) so the
// printed receipt/pay slip reads the same as the app.
const NAVY = '#124d7e'
const BLUE = '#50b5e1'

function esc(s: string): string {
  // Escapes quotes too — instituteName is interpolated into an alt="" attribute,
  // and every field here can derive from a self-edited full_name.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildHtml(
  partyLabel: 'STUDENT' | 'TUTOR',
  showClass: boolean,
  doc: FinanceDoc,
  org: OrgInfo,
  assets: BrandAssets,
): string {
  const rows = doc.lines
    .map(
      (l) => `<tr>
        <td style="padding:14px 0;border-bottom:1px solid #F0F1F5;">
          <span style="font-weight:600;color:#1f2937;">${esc(l.label)}</span>
          <span style="font-size:12px;color:#98a2b3;margin-left:8px;">(${l.hours} hrs)</span>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #F0F1F5;text-align:right;color:#1f2937;">${formatMoney(l.amount, doc.currency)}</td>
      </tr>`,
    )
    .join('')

  const discountRow =
    doc.discount && doc.discount > 0
      ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#667085;"><span>Discount</span><span>-${formatMoney(doc.discount, doc.currency)}</span></div>`
      : ''

  const sign = org.signatoryName
    ? `<div style="text-align:right;">
         <div style="font-size:10px;color:#98a2b3;letter-spacing:.5px;">${esc(org.signatureText ?? 'Digitally signed by')}</div>
         <div style="font-size:15px;font-weight:700;color:${NAVY};margin-top:4px;">${esc(org.signatoryName)}</div>
         <div style="font-size:12px;color:#98a2b3;">${esc(org.signatoryTitle ?? '')}</div>
       </div>`
    : ''

  const voidedBadge = doc.voided
    ? `<div style="position:absolute;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-18deg);font-size:84px;font-weight:800;color:rgba(220,38,38,.12);letter-spacing:6px;">VOID</div>`
    : ''

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:'Louis George Cafe';src:url(data:font/ttf;base64,${assets.louisGeorge}) format('truetype');}
    @font-face{font-family:'Dagger Square';src:url(data:font/otf;base64,${assets.daggerSquare}) format('opentype');}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Louis George Cafe',Arial,sans-serif;color:#1f2937;-webkit-print-color-adjust:exact;}
    .page{position:relative;width:100%;min-height:1040px;padding:48px 54px;border-top:5px solid ${NAVY};}
  </style></head><body><div class="page">
    ${voidedBadge}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <img src="data:image/png;base64,${assets.logo}" alt="${esc(org.instituteName)}" style="height:46px;">
      <div style="text-align:right;font-size:13px;color:#475467;line-height:1.7;">
        ${org.email ? `<div>${esc(org.email)}</div>` : ''}
        ${org.phone ? `<div>${esc(org.phone)}</div>` : ''}
      </div>
    </div>
    <div style="height:1px;background:#ECEEF3;margin:28px 0;"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:11px;letter-spacing:1.4px;color:#98a2b3;font-weight:700;">${partyLabel}</div>
        <div style="font-size:20px;font-weight:700;color:${NAVY};margin-top:6px;">${esc(doc.partyName)}</div>
        ${showClass && doc.classLevel ? `<div style="font-size:13px;color:#667085;margin-top:2px;">Class ${esc(doc.classLevel)}</div>` : ''}
      </div>
      <div style="text-align:right;font-size:13px;">
        <div style="margin-bottom:6px;"><span style="color:#98a2b3;">No </span><span style="font-weight:600;">${esc(doc.number)}</span></div>
        <div><span style="color:#98a2b3;">Issued </span><span style="font-weight:600;">${esc(doc.issueDate)}</span></div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:36px;">
      <thead><tr style="border-bottom:2px solid ${NAVY};">
        <th style="text-align:left;padding-bottom:10px;font-size:11px;letter-spacing:1.4px;color:${NAVY};">DESCRIPTION</th>
        <th style="text-align:right;padding-bottom:10px;font-size:11px;letter-spacing:1.4px;color:${NAVY};">AMOUNT</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:22px;">
      <div style="width:260px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#667085;"><span>Subtotal</span><span>${formatMoney(doc.subtotal, doc.currency)}</span></div>
        ${discountRow}
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px;padding-top:12px;border-top:1px solid #ECEEF3;">
          <span style="font-size:12px;color:#98a2b3;letter-spacing:.5px;font-weight:600;">TOTAL</span>
          <span style="font-size:24px;font-weight:800;color:${NAVY};">${formatMoney(doc.total, doc.currency)}</span>
        </div>
        <div style="height:3px;width:120px;margin-left:auto;margin-top:6px;background:${BLUE};border-radius:2px;"></div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:54px;gap:30px;">
      <div style="max-width:300px;">
        ${
          org.bankAccount
            ? `<div style="font-size:11px;letter-spacing:1.4px;color:#98a2b3;font-weight:700;">PAYMENT DETAILS</div>
               <div style="margin-top:8px;font-size:13px;line-height:1.8;color:#475467;">Account ${esc(org.bankAccount)}<br>IFSC ${esc(org.bankIfsc ?? '')} · ${esc(org.bankBranch ?? '')}</div>`
            : ''
        }
      </div>
      ${sign}
    </div>
    ${org.terms ? `<div style="margin-top:24px;border-top:1px solid #F0F1F5;padding-top:14px;font-size:11px;line-height:1.7;color:#98a2b3;">${esc(org.terms)}</div>` : ''}
    ${doc.note ? `<div style="margin-top:10px;font-size:11px;color:#98a2b3;">${esc(doc.note)}</div>` : ''}
  </div></body></html>`
}

export function buildReceiptHtml(doc: FinanceDoc, org: OrgInfo, assets: BrandAssets): string {
  return buildHtml('STUDENT', true, doc, org, assets)
}

export function buildPayslipHtml(doc: FinanceDoc, org: OrgInfo, assets: BrandAssets): string {
  return buildHtml('TUTOR', false, doc, org, assets)
}
