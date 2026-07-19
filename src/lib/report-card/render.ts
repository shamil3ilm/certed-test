import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { getReportCardData } from './data'
import { buildReportCardHtml } from './template'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { htmlToPdf } from '@/lib/pdf/render-pdf'

/**
 * Report card to PDF bytes. Returns null when the viewer isn't allowed to see
 * this student (getReportCardData gates), so the route can 404. Generated on
 * demand and never stored — the marks + attendance rows are the source of truth.
 */
export async function renderReportCardPdf(
  viewer: Profile,
  studentId: string,
): Promise<{ pdf: Buffer; filename: string } | null> {
  const data = await getReportCardData(viewer, studentId)
  if (!data) return null
  const org = await getOrgSettings()
  const generatedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const html = buildReportCardHtml(
    data,
    { instituteName: org.institute_name, email: org.contact_email, phone: org.contact_phone },
    generatedOn,
  )
  const slug =
    (data.student.full_name ?? 'student')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'student'
  return { pdf: await htmlToPdf(html), filename: `report-card-${slug}.pdf` }
}
