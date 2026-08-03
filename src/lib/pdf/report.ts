import { BRAND_COLORS } from '@/lib/brand/tokens'
import type { BrandAssets, OrgInfo } from './template'

/**
 * Reusable report template engine. A ReportDoc is a data-only
 * description of any institutional report - report card, progress report,
 * attendance report, etc. `renderReportHtml` wraps it in the shared branded
 * shell (logo header, institute contact, divider, footer) and renders each
 * section as key-value meta and/or a table. New reports are just a new
 * ReportDoc builder; the branding, header/footer and print CSS live here once.
 *
 * The HTML is self-contained (fonts + logo inlined) and print-friendly
 * (-webkit-print-color-adjust), so the SAME output is used for the PDF (via
 * htmlToPdf) and for an in-browser printable view.
 */

export type ReportMeta = { label: string; value: string }
export type ReportTable = {
  columns: string[]
  rows: Array<Array<string | number>>
  /** Per-column alignment; defaults to left. */
  align?: Array<'left' | 'right'>
}
export type ReportSection = {
  heading?: string
  meta?: ReportMeta[]
  table?: ReportTable
  note?: string
}
export type ReportDoc = {
  /** Small eyebrow label, e.g. 'ATTENDANCE REPORT'. */
  kind: string
  title: string
  subtitle?: string | null
  /** Right-aligned reference lines, e.g. Generated / Period. */
  reference?: ReportMeta[]
  sections: ReportSection[]
  footer?: string | null
}

const NAVY = BRAND_COLORS.primary
const BLUE = BRAND_COLORS.secondary

function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function metaGrid(meta: ReportMeta[]): string {
  return `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px 32px;margin-top:10px;">
    ${meta
      .map(
        (
          m,
        ) => `<div style="display:flex;justify-content:space-between;font-size:13px;border-bottom:1px solid #F0F1F5;padding:6px 0;">
          <span style="color:#98a2b3;">${esc(m.label)}</span>
          <span style="font-weight:600;color:#1f2937;">${esc(m.value)}</span>
        </div>`,
      )
      .join('')}
  </div>`
}

function tableBlock(table: ReportTable): string {
  const alignOf = (i: number) => (table.align?.[i] === 'right' ? 'right' : 'left')
  const head = table.columns
    .map(
      (c, i) =>
        `<th style="text-align:${alignOf(i)};padding-bottom:10px;font-size:11px;letter-spacing:1.2px;color:${NAVY};">${esc(c)}</th>`,
    )
    .join('')
  const body = table.rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, i) =>
              `<td style="padding:11px 0;border-bottom:1px solid #F0F1F5;text-align:${alignOf(i)};color:#1f2937;font-size:13px;">${esc(cell)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;margin-top:12px;">
    <thead><tr style="border-bottom:2px solid ${NAVY};">${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>`
}

function sectionBlock(section: ReportSection): string {
  const heading = section.heading
    ? `<div style="font-size:11px;letter-spacing:1.4px;color:#98a2b3;font-weight:700;margin-bottom:2px;">${esc(section.heading)}</div>`
    : ''
  const meta = section.meta && section.meta.length ? metaGrid(section.meta) : ''
  const table = section.table && section.table.rows.length ? tableBlock(section.table) : ''
  const emptyTable =
    section.table && section.table.rows.length === 0
      ? `<div style="margin-top:12px;font-size:13px;color:#98a2b3;">No records in this section.</div>`
      : ''
  const note = section.note
    ? `<div style="margin-top:10px;font-size:12px;color:#98a2b3;">${esc(section.note)}</div>`
    : ''
  return `<div style="margin-top:30px;">${heading}${meta}${table}${emptyTable}${note}</div>`
}

/** Renders a ReportDoc to a self-contained, branded, print-friendly HTML page. */
export function renderReportHtml(doc: ReportDoc, org: OrgInfo, assets: BrandAssets): string {
  const reference = (doc.reference ?? [])
    .map(
      (r) =>
        `<div style="margin-bottom:6px;"><span style="color:#98a2b3;">${esc(r.label)} </span><span style="font-weight:600;">${esc(r.value)}</span></div>`,
    )
    .join('')
  const signature = org.signatoryName
    ? `<div style="text-align:right;">
         <div style="font-size:10px;color:#98a2b3;letter-spacing:.5px;">${esc(org.signatureText ?? 'Signed by')}</div>
         <div style="font-size:15px;font-weight:700;color:${NAVY};margin-top:4px;">${esc(org.signatoryName)}</div>
         <div style="font-size:12px;color:#98a2b3;">${esc(org.signatoryTitle ?? '')}</div>
       </div>`
    : ''

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:'Louis George Cafe';src:url(data:font/ttf;base64,${assets.louisGeorge}) format('truetype');}
    @font-face{font-family:'Dagger Square';src:url(data:font/otf;base64,${assets.daggerSquare}) format('opentype');}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Louis George Cafe',Arial,sans-serif;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .page{position:relative;width:100%;min-height:1040px;padding:48px 54px;border-top:5px solid ${NAVY};}
    @media print{.page{min-height:auto;}}
  </style></head><body><div class="page">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <img src="data:image/png;base64,${assets.logo}" alt="${esc(org.instituteName)}" style="height:46px;">
      <div style="text-align:right;font-size:13px;color:#475467;line-height:1.7;">
        <div style="font-weight:700;color:${NAVY};">${esc(org.instituteName)}</div>
        ${org.email ? `<div>${esc(org.email)}</div>` : ''}
        ${org.phone ? `<div>${esc(org.phone)}</div>` : ''}
      </div>
    </div>
    <div style="height:1px;background:#ECEEF3;margin:28px 0;"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:11px;letter-spacing:1.4px;color:#98a2b3;font-weight:700;">${esc(doc.kind)}</div>
        <div style="font-size:22px;font-weight:800;color:${NAVY};margin-top:6px;">${esc(doc.title)}</div>
        ${doc.subtitle ? `<div style="font-size:13px;color:#667085;margin-top:2px;">${esc(doc.subtitle)}</div>` : ''}
      </div>
      <div style="text-align:right;font-size:13px;">${reference}</div>
    </div>
    ${doc.sections.map(sectionBlock).join('')}
    <div style="display:flex;justify-content:flex-end;margin-top:54px;">
      <div style="width:120px;height:3px;background:${BLUE};border-radius:2px;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px;gap:30px;">
      <div style="max-width:320px;font-size:11px;line-height:1.7;color:#98a2b3;">${doc.footer ? esc(doc.footer) : ''}</div>
      ${signature}
    </div>
    ${org.terms ? `<div style="margin-top:22px;border-top:1px solid #F0F1F5;padding-top:14px;font-size:11px;line-height:1.7;color:#98a2b3;">${esc(org.terms)}</div>` : ''}
  </div></body></html>`
}
