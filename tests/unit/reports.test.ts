import { describe, it, expect } from 'vitest'
import { buildProgressReport, buildAttendanceReport } from '@/lib/reports/builders'
import { renderReportHtml } from '@/lib/pdf/report'
import type { ReportCardData } from '@/lib/report-card/data'
import type { OrgInfo, BrandAssets } from '@/lib/pdf/template'

const data: ReportCardData = {
  student: {
    id: 's1',
    full_name: 'Sara Student',
    email: 'sara@x.dev',
    class_level: 'Grade 10',
    role: 'student',
  } as any,
  marks: [
    { className: 'Mathematics', topic: 'Algebra', title: 'Quiz 1', score: 18, maxMarks: 20 },
    { className: 'Science', topic: null, title: 'Test', score: 40, maxMarks: null },
  ],
  average: { percent: 90, gradedCount: 1, excludedNoPercent: 1 },
  attendance: { present: 8, late: 2, absent: 1, total: 11, rate: 91 },
}

const org: OrgInfo = { instituteName: 'Cert-Ed Academia', email: 'hi@certed.dev', phone: '+91 1' }
const assets: BrandAssets = { louisGeorge: '', daggerSquare: '', logo: '' }

describe('buildProgressReport', () => {
  it('produces a progress report with average, attendance, and a grades table', () => {
    const doc = buildProgressReport(data, '2026-08-03')
    expect(doc.kind).toBe('STUDENT PROGRESS REPORT')
    expect(doc.title).toBe('Sara Student')
    expect(doc.subtitle).toBe('Grade 10')
    expect(doc.reference).toEqual([{ label: 'Generated', value: '2026-08-03' }])
    expect(doc.sections[0].meta).toContainEqual({ label: 'Weighted average', value: '90% over 1 graded item' })
    expect(doc.sections[0].meta).toContainEqual({ label: 'Attendance', value: '91% (10/11 attended)' })
    expect(doc.sections[1].table).toEqual({
      columns: ['Class', 'Assessment', 'Score'],
      align: ['left', 'left', 'right'],
      rows: [
        ['Mathematics', 'Algebra - Quiz 1', '18 / 20'],
        ['Science', 'Test', '40'],
      ],
    })
  })

  it('reads "No graded work yet" when there is no average', () => {
    const doc = buildProgressReport({ ...data, average: null }, '2026-08-03')
    expect(doc.sections[0].meta).toContainEqual({ label: 'Weighted average', value: 'No graded work yet' })
  })
})

describe('buildAttendanceReport', () => {
  it('summarizes attendance', () => {
    const doc = buildAttendanceReport(data, '2026-08-03')
    expect(doc.kind).toBe('ATTENDANCE REPORT')
    expect(doc.sections[0].meta).toContainEqual({ label: 'Attendance rate', value: '91%' })
    expect(doc.sections[0].meta).toContainEqual({ label: 'Absent', value: '1' })
    expect(doc.sections[0].meta).toContainEqual({ label: 'Sessions recorded', value: '11' })
  })
})

describe('renderReportHtml', () => {
  it('renders a branded, self-contained page with the kind, title, headings, and HTML-escapes fields', () => {
    const doc = buildProgressReport({ ...data, student: { ...data.student, full_name: 'A<b>"X' } as any }, '2026-08-03')
    const html = renderReportHtml(doc, org, assets)
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('STUDENT PROGRESS REPORT')
    expect(html).toContain('A&lt;b&gt;&quot;X') // escaped title
    expect(html).toContain('Cert-Ed Academia') // institute name in the header
    expect(html).toContain('Assessments') // a section heading
    expect(html).toContain('data:font/ttf;base64,') // self-contained fonts
  })

  it('renders an empty-table note when a section table has no rows', () => {
    const doc = buildProgressReport({ ...data, marks: [] }, '2026-08-03')
    const html = renderReportHtml(doc, org, assets)
    expect(html).toContain('No records in this section.')
  })
})
