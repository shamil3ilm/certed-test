import type { ReportCardData } from './data'

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

export type ReportOrgInfo = { instituteName: string; email: string | null; phone: string | null }

/** A self-contained A4 report card: header, student block, marks table, and an
 *  attendance summary. Inline CSS only - headless Chromium prints it as-is. */
export function buildReportCardHtml(data: ReportCardData, org: ReportOrgInfo, generatedOn: string): string {
  const { student, marks, average, attendance } = data
  const name = esc(student.full_name ?? student.email)
  const contact = [org.email, org.phone]
    .filter(Boolean)
    .map((s) => esc(String(s)))
    .join(' - ')

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
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px 36px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4f46e5; padding-bottom: 12px; }
  .inst { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #4f46e5; }
  .contact { color: #64748b; font-size: 11px; margin-top: 2px; }
  .doc { text-align: right; }
  .doc h1 { font-size: 15px; margin: 0; text-transform: uppercase; letter-spacing: 0.08em; color: #334155; }
  .doc .date { color: #94a3b8; font-size: 11px; margin-top: 2px; }
  .student { display: flex; gap: 28px; margin: 20px 0 8px; }
  .student .label { color: #94a3b8; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
  .student .value { font-size: 14px; font-weight: 600; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #e2e8f0; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; border-bottom: 1.5px solid #cbd5e1; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #94a3b8; }
  .center { text-align: center; }
  .cards { display: flex; gap: 12px; margin-top: 8px; }
  .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
  .card .big { font-size: 22px; font-weight: 800; }
  .card .cap { color: #94a3b8; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
  .pres { color: #059669; } .late { color: #d97706; } .abs { color: #dc2626; }
  .foot { margin-top: 28px; color: #94a3b8; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="inst">${esc(org.instituteName)}</div>
      ${contact ? `<div class="contact">${contact}</div>` : ''}
    </div>
    <div class="doc">
      <h1>Report Card</h1>
      <div class="date">Generated ${esc(generatedOn)}</div>
    </div>
  </div>

  <div class="student">
    <div><div class="label">Student</div><div class="value">${name}</div></div>
    ${student.class_level ? `<div><div class="label">Class</div><div class="value">${esc(student.class_level)}</div></div>` : ''}
    ${
      average
        ? `<div><div class="label">Average</div><div class="value">${average.percent}%</div><div class="label">points-weighted across ${average.gradedCount} item${average.gradedCount === 1 ? '' : 's'}${average.excludedNoMax > 0 ? ` - ${average.excludedNoMax} not counted (no maximum set)` : ''}</div></div>`
        : ''
    }
  </div>

  <h2>Marks</h2>
  <table>
    <thead>
      <tr><th>Class</th><th>Topic</th><th>Assignment</th><th class="num">Mark</th></tr>
    </thead>
    <tbody>${marksRows}</tbody>
  </table>

  <h2>Attendance</h2>
  <div class="cards">
    <div class="card"><div class="big">${attendance.rate}%</div><div class="cap">Attendance${attendance.total ? ` - ${attendance.total} sessions` : ''}</div></div>
    <div class="card"><div class="big pres">${attendance.present}</div><div class="cap">Present</div></div>
    <div class="card"><div class="big late">${attendance.late}</div><div class="cap">Late</div></div>
    <div class="card"><div class="big abs">${attendance.absent}</div><div class="cap">Absent</div></div>
  </div>

  <div class="foot">This report is generated from marks and attendance recorded in ${esc(org.instituteName)}. Late arrivals count as attended in the rate.</div>
</body>
</html>`
}
