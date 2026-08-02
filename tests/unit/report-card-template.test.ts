import { describe, expect, it } from 'vitest'
import { buildReportCardHtml, type ReportOrgInfo } from '@/lib/report-card/template'
import type { ReportCardData } from '@/lib/report-card/data'

const assets = { louisGeorge: 'AAA', daggerSquare: 'BBB', logo: 'CCC' }

const org: ReportOrgInfo = {
  instituteName: 'Cert-Ed Academia',
  email: 'info@certedacademia.com',
  phone: '+91 9999999999',
}

const data: ReportCardData = {
  student: {
    id: 'student-1',
    auth_user_id: 'auth-student-1',
    email: 'student@example.com',
    full_name: 'Test Student',
    role: 'student',
    class_level: 'Grade 10',
    status: 'active',
  },
  marks: [
    {
      className: 'C12',
      topic: 'Maths',
      title: 'Chapter 1 practice sheet',
      score: 15,
      maxMarks: 20,
    },
  ],
  average: {
    percent: 75,
    gradedCount: 1,
    excludedNoPercent: 0,
  },
  attendance: {
    total: 5,
    present: 4,
    late: 1,
    absent: 0,
    rate: 100,
  },
}

describe('buildReportCardHtml', () => {
  const html = buildReportCardHtml(data, org, '02 Aug 2026', assets)

  it('uses the shared PDF scaffold markers', () => {
    expect(html).toContain('class="page"')
    expect(html).toContain('class="top"')
    expect(html).toContain('class="divider"')
    expect(html).toContain('class="meta"')
  })

  it('includes brand assets and report-card content', () => {
    expect(html).toContain('AAA')
    expect(html).toContain('BBB')
    expect(html).toContain('CCC')
    expect(html).toContain('Report Card')
    expect(html).toContain('Test Student')
    expect(html).toContain('Chapter 1 practice sheet')
    expect(html).toContain('Attendance - 5 sessions')
  })

  it('does not duplicate the institute name under the logo', () => {
    expect(html).not.toContain('<div class="inst">')
  })
})
