import type { ReportCardData } from './data'
import { BRAND_COLORS } from '@/lib/brand/tokens'
import type { BrandAssets } from '@/lib/pdf/template'

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

export type ReportOrgInfo = { instituteName: string; email: string | null; phone: string | null }

const NAVY = BRAND_COLORS.primary

/** A self-contained A4 report card: header, student block, marks table, and an
 *  attendance summary. Inline CSS only - headless Chromium prints it as-is. */
export function buildReportCardHtml(
  data: ReportCardData,
  org: ReportOrgInfo,
  generatedOn: string,
  assets: BrandAssets,
): string {
  const { student, marks, average, attendance } = data
  const name = esc(student.full_name ?? student.email)
  const contact = [org.email, org.phone]
    .filter(Boolean)
    .map((s) => esc(String(s)))
    .join(' - ')
  const averageSummary = average
    ? `Points-weighted across ${average.gradedCount} item${average.gradedCount === 1 ? '' : 's'}${
        average.excludedNoPercent > 0 ? ` - ${average.excludedNoPercent} not counted` : ''
      }`
    : null

  const marksRows = marks.length
    ? marks
        .map(
          (m) => `
        <tr>
          <td>${esc(m.className)}</td>
          <td>${m.topic ? esc(m.topic) : '<span class="muted">-</span>'}</td>
          <td>${esc(m.title)}</td>
          <td class="num">${m.score}${m.maxMarks != null ? ` <span class="muted">/ ${m.maxMarks}</span>` : ''}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="4" class="muted center">No marks recorded yet.</td></tr>`

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Report card - ${name}</title>
<style>
  @font-face { font-family: 'Louis George Cafe'; src: url(data:font/ttf;base64,${assets.louisGeorge}) format('truetype'); }
  @font-face { font-family: 'Dagger Square'; src: url(data:font/otf;base64,${assets.daggerSquare}) format('opentype'); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Louis George Cafe', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; }
  .page { width: 100%; min-height: 1040px; padding: 48px 54px; border-top: 5px solid ${NAVY}; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { height: 46px; width: auto; display: block; }
  .contact { color: #475467; font-size: 13px; line-height: 1.7; text-align: right; }
  .divider { height: 1px; background: #ECEEF3; margin: 28px 0; }
  .meta { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .meta-left { display: flex; flex-wrap: wrap; gap: 28px; }
  .meta-block { min-width: 0; }
  .meta-label { font-size: 11px; letter-spacing: 1.4px; color: #98a2b3; font-weight: 700; text-transform: uppercase; }
  .meta-value { font-size: 20px; font-weight: 700; color: ${NAVY}; margin-top: 6px; }
  .meta-sub { font-size: 12px; color: #98a2b3; margin-top: 4px; line-height: 1.45; max-width: 300px; }
  .doc { text-align: right; font-size: 13px; }
  .doc h1 { font-family: 'Dagger Square', 'Louis George Cafe', Georgia, serif; font-size: 15px; margin: 0; text-transform: uppercase; letter-spacing: 0.08em; color: ${NAVY}; }
  .doc .date { color: #98a2b3; font-size: 11px; margin-top: 4px; }
  .section-title { font-size: 11px; letter-spacing: 1.4px; color: ${NAVY}; font-weight: 700; text-transform: uppercase; margin: 34px 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 12px 8px; border-bottom: 1px solid #F0F1F5; }
  th { font-size: 11px; letter-spacing: 1.2px; color: ${NAVY}; font-weight: 700; border-bottom: 2px solid ${NAVY}; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #98a2b3; }
  .center { text-align: center; }
  .cards { display: flex; gap: 12px; margin-top: 10px; }
  .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; background: #fff; }
  .card.summary-card { background: linear-gradient(180deg, rgb(18 77 126 / 0.05), transparent); }
  .card .big { font-family: 'Dagger Square', 'Louis George Cafe', Georgia, serif; font-size: 22px; font-weight: 800; color: ${NAVY}; }
  .card .cap { color: #98a2b3; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }
  .pres { color: #059669; } .late { color: #d97706; } .abs { color: #dc2626; }
  .foot { margin-top: 28px; color: #98a2b3; font-size: 10px; border-top: 1px solid #ECEEF3; padding-top: 10px; line-height: 1.6; }
</style>
</head>
<body>
  <div class="page">
    <div class="top">
      <img class="logo" src="data:image/png;base64,${assets.logo}" alt="${esc(org.instituteName)}" />
      <div class="contact">
        ${contact ? contact : '&nbsp;'}
      </div>
    </div>
    <div class="divider"></div>

    <div class="meta">
      <div class="meta-left">
        <div class="meta-block">
          <div class="meta-label">Student</div>
          <div class="meta-value">${name}</div>
        </div>
        ${student.class_level ? `<div class="meta-block"><div class="meta-label">Class</div><div class="meta-value">${esc(student.class_level)}</div></div>` : ''}
        ${
          average
            ? `<div class="meta-block"><div class="meta-label">Average</div><div class="meta-value">${average.percent}%</div>${averageSummary ? `<div class="meta-sub">${esc(averageSummary)}</div>` : ''}</div>`
            : ''
        }
      </div>
      <div class="doc">
        <h1>Report Card</h1>
        <div class="date">Generated ${esc(generatedOn)}</div>
      </div>
    </div>

    <div class="section-title">Marks</div>
    <table>
      <thead>
        <tr><th>Class</th><th>Topic</th><th>Assignment</th><th class="num">Mark</th></tr>
      </thead>
      <tbody>${marksRows}</tbody>
    </table>

    <div class="section-title">Attendance</div>
    <div class="cards">
      <div class="card summary-card"><div class="big">${attendance.rate}%</div><div class="cap">Attendance${attendance.total ? ` - ${attendance.total} sessions` : ''}</div></div>
      <div class="card"><div class="big pres">${attendance.present}</div><div class="cap">Present</div></div>
      <div class="card"><div class="big late">${attendance.late}</div><div class="cap">Late</div></div>
      <div class="card"><div class="big abs">${attendance.absent}</div><div class="cap">Absent</div></div>
    </div>

    <div class="foot">This report is generated from marks and attendance recorded in ${esc(org.instituteName)}. Late arrivals count as attended in the rate.</div>
  </div>
</body>
</html>`
}
