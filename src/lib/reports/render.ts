import 'server-only'
import type { ActorContext } from '@/lib/session/actor-context'
import { getReportCardData } from '@/lib/report-card/data'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { brandAssets } from '@/lib/pdf/brand-assets'
import { renderReportHtml } from '@/lib/pdf/report'
import { htmlToPdf } from '@/lib/pdf/render-pdf'
import { formatDate } from '@/lib/time/format'
import type { OrgInfo } from '@/lib/pdf/template'
import { buildAttendanceReport, buildProgressReport } from './builders'

/** Student-scoped reports that render through the reusable engine. Both reuse the
 *  gated report-card dataset, so access follows the same rule (own -> viewClasses,
 *  another student -> viewMentees, admin/mentor). Generated on demand, never stored. */
export type StudentReportType = 'progress' | 'attendance'
export type ReportFormat = 'pdf' | 'html'

const BUILDERS = {
  progress: buildProgressReport,
  attendance: buildAttendanceReport,
} as const

export function isStudentReportType(value: string): value is StudentReportType {
  return value === 'progress' || value === 'attendance'
}

function slugify(name: string): string {
  return (
    name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'student'
  )
}

export type RenderedReport = { body: Buffer | string; contentType: string; filename: string }

export async function renderStudentReport(
  actor: ActorContext,
  studentId: string,
  type: StudentReportType,
  format: ReportFormat,
): Promise<RenderedReport | null> {
  const data = await getReportCardData(actor, studentId)
  if (!data) return null

  const org = await getOrgSettings()
  const orgInfo: OrgInfo = {
    instituteName: org.institute_name,
    email: org.contact_email,
    phone: org.contact_phone,
  }
  const generatedOn = formatDate(new Date().toISOString())
  const html = renderReportHtml(BUILDERS[type](data, generatedOn), orgInfo, brandAssets())
  const slug = slugify(data.student.full_name ?? 'student')

  if (format === 'html') {
    return { body: html, contentType: 'text/html; charset=utf-8', filename: `${type}-report-${slug}.html` }
  }
  return { body: await htmlToPdf(html), contentType: 'application/pdf', filename: `${type}-report-${slug}.pdf` }
}
